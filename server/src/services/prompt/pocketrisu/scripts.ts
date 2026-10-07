import { Worker } from 'node:worker_threads'

import type { RegexScript } from '@malang/shared'

// Port of processScriptFull's regex stage. Regexes run in a worker so a catastrophic pattern
// cannot stall the server.

export type ScriptMode = 'editinput' | 'editoutput' | 'editprocess' | 'editdisplay'

/** PocketRisu's stored `customscript` shape. */
interface RisuScript {
    in: string
    out: string
    type: string
    flag?: string
    ableFlag?: boolean
}

interface ParsedScript {
    script: RisuScript
    order: number
    actions: string[]
}

interface SandboxRequest {
    data: string
    pattern: string
    flag: string
    out: string
    actions: string[]
    chatId: number
}

interface SandboxResponse {
    id: number
    data?: string
    parse?: boolean
    error?: string
}

/** Restores the PocketRisu script a Malang regex was imported from. */
function toRisuScript(script: RegexScript): RisuScript {
    const raw = script.raw
    if (raw && typeof raw.in === 'string' && typeof raw.out === 'string') {
        return {
            in: script.pattern,
            out: script.replacement,
            type: script.enabled ? script.phase : 'disabled',
            flag: typeof raw.flag === 'string' ? raw.flag : undefined,
            ableFlag: typeof raw.ableFlag === 'boolean' ? raw.ableFlag : undefined,
        }
    }
    return {
        in: script.pattern,
        out: script.replacement,
        type: script.enabled ? script.phase : 'disabled',
        flag: script.flags,
        ableFlag: !!script.flags,
    }
}

function parseScripts(scripts: RegexScript[]): ParsedScript[] {
    const parsed: ParsedScript[] = []
    let orderChanged = false
    for (const source of scripts) {
        const script = toRisuScript(source)
        if (script.ableFlag && script.flag?.includes('<')) {
            let order = 0
            const actions: string[] = []
            const flag = script.flag.replace(/<(.+?)>/g, (_match, inner: string) => {
                for (const meta of inner.split(',').map((value) => value.trim())) {
                    if (meta.startsWith('order ')) {
                        order = Number.parseInt(meta.substring(6))
                        orderChanged = true
                    } else {
                        actions.push(meta)
                    }
                }
                return ''
            })
            parsed.push({ script: { ...script, flag }, order, actions })
            continue
        }
        parsed.push({ script, order: 0, actions: [] })
    }
    if (orderChanged) parsed.sort((a, b) => b.order - a.order)
    return parsed
}

const sandboxSource = String.raw`
const { parentPort } = require('node:worker_threads')
parentPort.on('message', (request) => {
  try {
    parentPort.postMessage({ id: request.id, ...execute(request) })
  } catch (error) {
    parentPort.postMessage({ id: request.id, error: String(error && error.message || error) })
  }
})
function execute({ data, pattern, flag, out, actions, chatId }) {
  const reg = new RegExp(pattern, flag)
  const moving = out.startsWith('@@move_top') || out.startsWith('@@move_bottom') ||
    actions.includes('move_top') || actions.includes('move_bottom')
  if (out.startsWith('@@') || actions.length > 0) {
    if (!reg.test(data)) return { data, parse: false }
    if (out.startsWith('@@emo ')) return { data, parse: false }
    if ((out.startsWith('@@inject') || actions.includes('inject')) && chatId !== -1) {
      return { data: data.replace(reg, ''), parse: false }
    }
    if (moving) {
      const isGlobal = flag.includes('g')
      const matchAll = isGlobal ? data.matchAll(reg) : [data.match(reg)]
      data = data.replace(reg, '')
      for (const matched of matchAll) {
        if (!matched) continue
        const inData = matched[0]
        const replaced = out.replace('@@move_top ', '').replace('@@move_bottom ', '')
          .replace(/(?<!\$)\$[0-9]+/g, (v) => {
            const index = parseInt(v.substring(1))
            return index < matched.length ? matched[index] : v
          })
          .replace(/\$\&/g, inData)
          .replace(/(?<!\$)\$<([^>]+)>/g, (v) => {
            const groupName = parseInt(v.substring(2, v.length - 1))
            return matched.groups && matched.groups[groupName] ? matched.groups[groupName] : v
          })
        if (out.startsWith('@@move_top') || actions.includes('move_top')) data = replaced + '\n' + data
        else data = data + '\n' + replaced
      }
      return { data, parse: true }
    }
    return { data: data.replace(reg, out), parse: true }
  }
  return { data: data.replace(reg, out), parse: true }
}
`

interface WorkerHandle {
    on(event: 'message', listener: (message: SandboxResponse) => void): void
    on(event: 'error', listener: (error: Error) => void): void
    postMessage(message: SandboxRequest & { id: number }): void
    terminate(): Promise<number>
}

/** A long-lived worker that applies one regex script at a time. */
export class RegexSandbox {
    private worker: WorkerHandle | null = null
    private nextId = 0
    private pending = new Map<number, (response: SandboxResponse) => void>()

    constructor(private readonly timeoutMs = 2_000) {}

    private spawn(): WorkerHandle {
        if (this.worker) return this.worker
        const worker = new Worker(sandboxSource, { eval: true }) as unknown as WorkerHandle
        worker.on('message', (message) => {
            this.pending.get(message.id)?.(message)
            this.pending.delete(message.id)
        })
        worker.on('error', (error) => {
            for (const resolve of this.pending.values()) resolve({ id: -1, error: error.message })
            this.pending.clear()
            this.worker = null
        })
        this.worker = worker
        return worker
    }

    run(request: SandboxRequest): Promise<SandboxResponse> {
        const worker = this.spawn()
        const id = this.nextId++
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                // A stuck regex cannot be interrupted, only discarded with its worker.
                void worker.terminate()
                if (this.worker === worker) this.worker = null
                resolve({ id, error: 'Regex timed out' })
            }, this.timeoutMs)
            this.pending.set(id, (response) => {
                clearTimeout(timer)
                resolve(response)
            })
            worker.postMessage({ id, ...request })
        })
    }

    close() {
        void this.worker?.terminate()
        this.worker = null
    }
}

/** Parses the input, then re-parses after every script that changed it (PocketRisu order). */
export async function processScripts(input: {
    scripts: RegexScript[]
    data: string
    mode: ScriptMode
    chatId: number
    parse: (text: string) => string
    sandbox: RegexSandbox
    warnings: string[]
}): Promise<string> {
    let data = input.parse(input.data)
    for (const { script, actions } of parseScripts(input.scripts)) {
        if (script.in === '' || script.type !== input.mode) continue

        let out = script.out.replaceAll('$n', '\n').replace(/{{data}}/g, '$&')
        let flag = 'g'
        if (script.ableFlag) flag = script.flag || 'g'
        if (
            out.startsWith('@@move_top') ||
            out.startsWith('@@move_bottom') ||
            actions.includes('move_top') ||
            actions.includes('move_bottom')
        ) {
            flag = flag.replace('g', '')
        }
        if (out.endsWith('>') && !actions.includes('no_end_nl')) out += '\n'
        flag = flag.trim().replace(/[^dgimsuvy]/g, '')
        flag = flag
            .split('')
            .filter((value, index, all) => all.indexOf(value) === index)
            .join('')
        if (flag.length === 0) flag = 'u'

        const pattern = actions.includes('cbs') ? input.parse(script.in) : script.in
        const result = await input.sandbox.run({
            data,
            pattern,
            flag,
            out,
            actions,
            chatId: input.chatId,
        })
        if (result.error !== undefined) {
            input.warnings.push(`Regex ${script.in} was skipped: ${result.error}`)
            continue
        }
        data = result.parse ? input.parse(result.data ?? data) : (result.data ?? data)
    }
    return data
}
