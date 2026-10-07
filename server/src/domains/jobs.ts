import { Hono } from 'hono'
import { z } from 'zod'

import { NotFoundError } from '@/errors'
import type { AppContext } from '@/services'
import { type AppEnv, queryValidator } from '@/utils'

const ActiveJobQuerySchema = z.object({
    conversationId: z.uuid().optional(),
    messageId: z.uuid().optional(),
})

export function createJobDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', queryValidator(ActiveJobQuerySchema), (c) =>
            c.json({ jobs: context.jobs.listActive(c.req.valid('query')) }),
        )
        .get('/:id', (c) => {
            const job = context.jobs.get(c.req.param('id'))
            if (!job) throw new NotFoundError('Job not found')
            return c.json(job)
        })
        .post('/:id/cancel', (c) => {
            const [job] = context.jobs.cancel({ id: c.req.param('id') })
            if (!job) throw new NotFoundError('Active job not found')
            return c.json(job)
        })
        .post('/:id/retry', (c) => {
            const job = context.jobs.retry(c.req.param('id'))
            if (!job) throw new NotFoundError('Failed job not found')
            return c.json(job)
        })
}
