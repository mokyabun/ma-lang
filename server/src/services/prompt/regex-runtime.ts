import { Worker } from 'node:worker_threads'

import type { RegexPhase, RegexScript } from '@malang/shared'

import { renderTemplate, type TemplateContext } from './template-engine'

export interface RegexResult {
    text: string
    warnings: string[]
    appliedScriptIds: string[]
    timedOut: boolean
}

interface PreparedScript {
    id: string
    pattern: string
    replacement: string
    flags: string
    actions: string[]
}

interface WorkerMessage {
    type: 'checkpoint' | 'complete'
    text: string
    scriptId?: string
    warning?: string
}

interface WorkerWithEvents {
    on(event: 'message', listener: (message: WorkerMessage) => void): void
    on(event: 'error', listener: (error: Error) => void): void
    terminate(): Promise<number>
}

const workerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads')
let text = workerData.text
for (const script of workerData.scripts) {
  try {
    let flags = script.flags || 'g'
    const moving = script.actions.includes('move_top') || script.actions.includes('move_bottom') ||
      script.replacement.startsWith('@@move_top') || script.replacement.startsWith('@@move_bottom')
    if (moving) flags = flags.replaceAll('g', '')
    flags = [...new Set(flags.replace(/[^dgimsuvy]/g, '').split(''))].join('') || 'u'
    const regex = new RegExp(script.pattern, flags)
    let replacement = script.replacement.replaceAll('$n', '\n').replaceAll('{{data}}', '$&')
    if (replacement.endsWith('>') && !script.actions.includes('no_end_nl')) replacement += '\n'
    if (moving) {
      const top = script.actions.includes('move_top') || replacement.startsWith('@@move_top')
      replacement = replacement.replace(/^@@move_(?:top|bottom)\s*/, '')
      const matches = []
      const scanFlags = flags.includes('g') ? flags : flags + 'g'
      const scan = new RegExp(script.pattern, scanFlags)
      for (const match of text.matchAll(scan)) matches.push(match)
      text = text.replace(scan, '')
      for (const match of matches) {
        const rendered = replacement
          .replace(/\$<([^>]+)>/g, (_, name) => match.groups?.[name] ?? '')
          .replace(/\$([0-9]+)/g, (_, index) => match[Number(index)] ?? '')
          .replaceAll('$&', match[0])
        text = top ? rendered + '\n' + text : text + '\n' + rendered
      }
    } else {
      text = text.replace(regex, replacement)
    }
    if (text.length > workerData.maxOutputLength) throw new Error('Regex output limit exceeded')
    parentPort.postMessage({ type: 'checkpoint', text, scriptId: script.id })
  } catch (error) {
    parentPort.postMessage({
      type: 'checkpoint',
      text,
      scriptId: script.id,
      warning: 'Regex ' + script.id + ' was skipped: ' + (error?.message || String(error)),
    })
  }
}
parentPort.postMessage({ type: 'complete', text })
`

export async function processRegexText(input: {
    text: string
    phase: RegexPhase
    scripts: RegexScript[]
    templateContext: TemplateContext
    timeoutMs?: number
    maxOutputLength?: number
}): Promise<RegexResult> {
    const warnings: string[] = []
    const sorted = prepareScripts(input.scripts, input.phase, input.templateContext, warnings)
    if (!sorted.length) {
        return { text: input.text, warnings, appliedScriptIds: [], timedOut: false }
    }
    if (input.text.length > 1024 * 1024) {
        return {
            text: input.text,
            warnings: [...warnings, 'Regex input limit exceeded'],
            appliedScriptIds: [],
            timedOut: false,
        }
    }

    return new Promise((resolve) => {
        let checkpoint = input.text
        let settled = false
        const appliedScriptIds: string[] = []
        const worker = new Worker(workerSource, {
            eval: true,
            workerData: {
                text: input.text,
                scripts: sorted,
                maxOutputLength: input.maxOutputLength || 1024 * 1024,
            },
        }) as unknown as WorkerWithEvents
        const finish = (result: RegexResult) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            void worker.terminate()
            resolve(result)
        }
        const timer = setTimeout(() => {
            finish({
                text: checkpoint,
                warnings: [...warnings, `Regex ${input.phase} phase timed out`],
                appliedScriptIds,
                timedOut: true,
            })
        }, input.timeoutMs || 2_000)
        worker.on('message', (message: WorkerMessage) => {
            checkpoint = message.text
            if (message.warning) warnings.push(message.warning)
            if (message.type === 'checkpoint' && message.scriptId) {
                appliedScriptIds.push(message.scriptId)
            }
            if (message.type === 'complete') {
                finish({
                    text: checkpoint,
                    warnings: [...new Set(warnings)],
                    appliedScriptIds,
                    timedOut: false,
                })
            }
        })
        worker.on('error', (error) => {
            finish({
                text: checkpoint,
                warnings: [...warnings, `Regex worker failed: ${error.message}`],
                appliedScriptIds,
                timedOut: false,
            })
        })
    })
}

export function collectRegexScripts(
    preset: { regexScripts: RegexScript[] },
    character: { regexScripts: RegexScript[] },
    modules: Array<{ regexScripts: RegexScript[] }>,
): RegexScript[] {
    return [
        ...preset.regexScripts,
        ...character.regexScripts,
        ...modules.flatMap((module) => module.regexScripts),
    ].slice(0, 2_000)
}

function prepareScripts(
    scripts: RegexScript[],
    phase: RegexPhase,
    context: TemplateContext,
    warnings: string[],
): PreparedScript[] {
    let orderChanged = false
    return scripts
        .filter(
            (script) =>
                script.enabled &&
                script.phase === phase &&
                typeof script.pattern === 'string' &&
                script.pattern.length > 0 &&
                typeof script.replacement === 'string',
        )
        .flatMap((script, index) => {
            const parsed = parseFlags(typeof script.flags === 'string' ? script.flags : '')
            const replacementAction = script.replacement.match(
                /^@@(emo|inject|repeat_back|move_top|move_bottom)/,
            )?.[1]
            if (replacementAction) parsed.actions.push(replacementAction)
            orderChanged ||= parsed.order !== 0
            if (
                parsed.actions.some((action) => ['emo', 'inject', 'repeat_back'].includes(action))
            ) {
                warnings.push(
                    `Regex ${script.comment || script.id} uses an unsupported stateful action`,
                )
                return []
            }
            const pattern = parsed.actions.includes('cbs')
                ? renderTemplate(script.pattern, context).text
                : script.pattern
            // Substitute captures before CBS so {{img::$1}} resolves (PocketRisu order).
            const rendered =
                phase === 'editdisplay'
                    ? { text: script.replacement, warnings: [] }
                    : renderTemplate(script.replacement, context)
            warnings.push(...rendered.warnings)
            return [
                {
                    id: script.id,
                    pattern,
                    replacement: rendered.text,
                    flags: parsed.flags,
                    actions: parsed.actions,
                    order: parsed.order,
                    index,
                },
            ]
        })
        .sort((left, right) =>
            orderChanged
                ? right.order - left.order || left.index - right.index
                : left.index - right.index,
        )
        .map(({ order: _order, index: _index, ...script }) => script)
}

function parseFlags(value: string) {
    const actions: string[] = []
    let order = 0
    const flags = value.replace(/<(.+?)>/g, (_full, source: string) => {
        for (const item of source.split(',').map((part) => part.trim().toLocaleLowerCase())) {
            if (item.startsWith('order ')) order = Number.parseInt(item.slice(6), 10) || 0
            else actions.push(item)
        }
        return ''
    })
    return { flags, actions: [...new Set(actions)], order }
}
