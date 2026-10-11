import { PromptPresetInputSchema } from '@malang/shared'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AppContext } from '@/context'
import { ConflictError, NotFoundError } from '@/lib/errors'
import { type AppEnv, binaryResponse, jsonValidator, parseEnum, readImportFile } from '@/lib/http'

export function createPromptPresetDomain(context: AppContext) {
    const RegexPreviewSchema = z.object({
        text: z.string().max(1_000_000),
        phase: z.enum(['editinput', 'editprocess', 'editoutput', 'editdisplay']),
        scripts: z.array(z.any()).max(2_000),
    })
    return new Hono<AppEnv>()
        .get('/', (c) => c.json({ promptPresets: context.prompts.list() }))
        .post('/', jsonValidator(PromptPresetInputSchema), (c) =>
            c.json(context.prompts.create(c.req.valid('json')), 201),
        )
        .post('/import', async (c) => {
            const file = await readImportFile(c, context.config.limits.importBytes)
            return c.json(await context.prompts.import(file.bytes, file.filename), 201)
        })
        .post('/regex-preview', jsonValidator(RegexPreviewSchema), async (c) =>
            c.json(await context.prompts.previewRegex(c.req.valid('json') as never)),
        )
        .post('/:id/regex/import', async (c) => {
            const file = await readImportFile(c, context.config.limits.importBytes)
            const mode = parseEnum(
                c.req.query('mode') || 'append',
                ['append', 'replace'] as const,
                'mode',
            )
            const preset = context.prompts.importRegex(c.req.param('id'), file.bytes, mode)
            if (!preset) throw new NotFoundError('Prompt preset not found')
            return c.json(preset)
        })
        .get('/:id/regex/export', (c) => {
            const bytes = context.prompts.exportRegex(c.req.param('id'))
            if (!bytes) throw new NotFoundError('Prompt preset not found')
            return binaryResponse(bytes, 'application/json', `regex-${c.req.param('id')}.json`)
        })
        .get('/:id/export', async (c) => {
            const format = parseEnum(
                c.req.query('format') ?? 'json',
                ['json', 'risupreset', 'risup'] as const,
                'format',
            )
            const bytes = await context.prompts.export(c.req.param('id'), format)
            if (!bytes) throw new NotFoundError('Prompt preset not found')

            return binaryResponse(
                bytes,
                format === 'json' ? 'application/json' : 'application/octet-stream',
                `prompt-${c.req.param('id')}.${format}`,
            )
        })
        .get('/:id', (c) => {
            const preset = context.prompts.get(c.req.param('id'))
            if (!preset) throw new NotFoundError('Prompt preset not found')
            return c.json(preset)
        })
        .put('/:id', jsonValidator(PromptPresetInputSchema), (c) => {
            const preset = context.prompts.update(c.req.param('id'), c.req.valid('json'))
            if (!preset) throw new NotFoundError('Prompt preset not found')
            return c.json(preset)
        })
        .delete('/:id', (c) => {
            const result = context.prompts.delete(c.req.param('id'))
            if (result === 'not_found') throw new NotFoundError('Prompt preset not found')
            if (result === 'in_use') {
                throw new ConflictError('Prompt preset is in use by a conversation')
            }
            return c.body(null, 204)
        })
}
