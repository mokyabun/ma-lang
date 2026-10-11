import {
    ConversationCreateSchema,
    ConversationOrganizationSchema,
    GroupCreateSchema,
    GroupUpdateSchema,
    LongTermMemorySettingsPatchSchema,
} from '@malang/shared'
import { Hono } from 'hono'
import { z } from 'zod'

import type { AppContext } from '@/context'
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors'
import { type AppEnv, jsonValidator } from '@/lib/http'

const ConversationPatchBody = z.object({
    title: z.string().max(200).optional(),
    promptPresetId: z.uuid().optional(),
    promptPresetLocked: z.boolean().optional(),
    modelPresetId: z.uuid().nullable().optional(),
    auxiliaryModelPresetId: z.uuid().nullable().optional(),
    modelChainPresetId: z.uuid().nullable().optional(),
    variables: z.record(z.string(), z.string()).optional(),
    authorNote: z.string().max(1_000_000).optional(),
    boundPersonaId: z.uuid().nullable().optional(),
    personaLocked: z.boolean().optional(),
    greetingIndex: z.number().int().min(-1).optional(),
})
const MessagePatchBody = z.object({ content: z.string().max(1_000_000) })
const MessagePageQuery = z.object({
    before: z.coerce.number().int().nonnegative().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
})
const GenerationSelectionBody = z.object({ generationId: z.uuid() })
const ConversationModuleBody = z.object({ enabled: z.boolean().nullable() })
const ConversationGroupCreateBody = GroupCreateSchema.extend({ characterId: z.uuid() })
const MemorySummaryPatchBody = z
    .object({
        text: z.string().trim().min(1).max(1_000_000).optional(),
        isImportant: z.boolean().optional(),
    })
    .refine((value) => value.text !== undefined || value.isImportant !== undefined, {
        message: 'At least one summary field is required',
    })

export function createConversationRoutes(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) =>
            c.json({
                conversations: context.conversations.list(c.req.query('archived') === 'true'),
                groups: context.conversations.listGroups(),
            }),
        )
        .post('/', jsonValidator(ConversationCreateSchema), (c) => {
            const input = c.req.valid('json')
            const character = context.characters.get(input.characterId)
            if (!character) {
                throw new NotFoundError('Character not found')
            }
            if (
                input.greetingIndex >= 0 &&
                character.alternateGreetings[input.greetingIndex] === undefined
            ) {
                throw new ValidationError('Greeting does not exist')
            }
            if (input.promptPresetId && !context.prompts.get(input.promptPresetId)) {
                throw new NotFoundError('Prompt preset not found')
            }
            if (input.modelPresetId && !context.providers.getModelPreset(input.modelPresetId)) {
                throw new NotFoundError('Model preset not found')
            }
            if (
                input.auxiliaryModelPresetId &&
                !context.providers.getModelPreset(input.auxiliaryModelPresetId)
            ) {
                throw new NotFoundError('Auxiliary model preset not found')
            }
            if (input.modelChainPresetId && !context.modelChains.get(input.modelChainPresetId)) {
                throw new NotFoundError('Model chain preset not found')
            }
            return c.json(context.conversations.create(input), 201)
        })
        .post('/groups', jsonValidator(ConversationGroupCreateBody), (c) => {
            const input = c.req.valid('json')
            const group = context.conversations.createGroup(input.characterId, input.name)
            if (!group) throw new NotFoundError('Character not found')
            return c.json(group, 201)
        })
        .patch('/groups/:groupId', jsonValidator(GroupUpdateSchema), (c) => {
            const name = c.req.valid('json').name
            if (!name) throw new ValidationError('Group name is required')
            const group = context.conversations.updateGroup(c.req.param('groupId'), name)
            if (!group) throw new NotFoundError('Chat group not found')
            return c.json(group)
        })
        .delete('/groups/:groupId', (c) => {
            if (!context.conversations.deleteGroup(c.req.param('groupId'))) {
                throw new NotFoundError('Chat group not found')
            }
            return c.body(null, 204)
        })
        .put('/organization', jsonValidator(ConversationOrganizationSchema), (c) => {
            const input = c.req.valid('json')
            if (!context.conversations.updateOrganization(input)) {
                throw new ValidationError('Invalid chat organization')
            }
            return c.json({
                conversations: context.conversations
                    .list(false)
                    .filter((conversation) => conversation.characterId === input.characterId),
                groups: context.conversations.listGroups(input.characterId),
            })
        })
        .post('/:id/restore', (c) => {
            if (!context.conversations.restore(c.req.param('id'))) {
                throw new NotFoundError('Conversation not found')
            }
            return c.json(context.conversations.requireConversation(c.req.param('id')))
        })
        .get('/:id/generation', (c) => {
            context.conversations.requireConversation(c.req.param('id'))
            return c.json({
                generation: context.generations.activeRun(c.req.param('id')),
            })
        })
        .get('/:id/messages', async (c) => {
            context.conversations.requireConversation(c.req.param('id'))
            const query = MessagePageQuery.safeParse({
                before: c.req.query('before'),
                limit: c.req.query('limit'),
            })
            if (!query.success) throw new ValidationError('Invalid message page query')
            return c.json(
                await context.generations.messagePageWithDisplay(c.req.param('id'), query.data),
            )
        })
        .get('/:id/memory', (c) => {
            context.conversations.requireConversation(c.req.param('id'))
            return c.json(context.memory.state(c.req.param('id')))
        })
        .patch('/:id/memory', jsonValidator(LongTermMemorySettingsPatchSchema), (c) => {
            const conversationId = c.req.param('id')
            context.conversations.requireConversation(conversationId)
            const current = context.memory.state(conversationId).settings
            const patch = c.req.valid('json')
            if (
                (patch.recentMemoryRatio ?? current.recentMemoryRatio) +
                    (patch.similarMemoryRatio ?? current.similarMemoryRatio) >
                1
            ) {
                throw new ValidationError(
                    'Recent and similar memory ratios must add up to at most 1',
                )
            }
            return c.json(context.memory.updateSettings(conversationId, patch))
        })
        .delete('/:id/memory', (c) => {
            context.conversations.requireConversation(c.req.param('id'))
            return c.json({ deleted: context.memory.clear(c.req.param('id')) })
        })
        .patch('/:id/memory/summaries/:summaryId', jsonValidator(MemorySummaryPatchBody), (c) => {
            context.conversations.requireConversation(c.req.param('id'))
            const summary = context.memory.updateSummary(
                c.req.param('id'),
                c.req.param('summaryId'),
                c.req.valid('json'),
            )
            if (!summary) throw new NotFoundError('Memory summary not found')
            return c.json(summary)
        })
        .delete('/:id/memory/summaries/:summaryId', (c) => {
            context.conversations.requireConversation(c.req.param('id'))
            if (!context.memory.deleteSummary(c.req.param('id'), c.req.param('summaryId'))) {
                throw new NotFoundError('Memory summary not found')
            }
            return c.body(null, 204)
        })
        .get('/:id/modules', (c) => {
            context.conversations.requireConversation(c.req.param('id'))
            return c.json({ modules: context.modules.conversationStates(c.req.param('id')) })
        })
        .put('/:id/modules/:moduleId', jsonValidator(ConversationModuleBody), (c) => {
            context.conversations.requireConversation(c.req.param('id'))
            if (
                !context.modules.setConversationState(
                    c.req.param('id'),
                    c.req.param('moduleId'),
                    c.req.valid('json').enabled,
                )
            ) {
                throw new NotFoundError('Prompt module not found')
            }
            return c.json({ modules: context.modules.conversationStates(c.req.param('id')) })
        })
        .patch('/:id/messages/:messageId', jsonValidator(MessagePatchBody), (c) => {
            const message = context.conversations.requireMessage(
                c.req.param('id'),
                c.req.param('messageId'),
            )
            const updated = context.conversations.updateMessage(
                message.id,
                c.req.valid('json').content,
            )
            if (!updated) throw new NotFoundError('Message not found')
            return c.json(updated)
        })
        .delete('/:id/messages/:messageId/after', (c) => {
            const message = context.conversations.requireMessage(
                c.req.param('id'),
                c.req.param('messageId'),
            )
            const deleted = context.conversations.truncateMessages(
                message.conversationId,
                message.position + 1,
            )
            context.illustrationPipeline.handleMessagesRemoved(message.conversationId)
            return c.json({ deleted })
        })
        .delete('/:id/messages/:messageId/from', (c) => {
            const message = context.conversations.requireMessage(
                c.req.param('id'),
                c.req.param('messageId'),
            )
            const deleted = context.conversations.truncateMessages(
                message.conversationId,
                message.position,
            )
            context.illustrationPipeline.handleMessagesRemoved(message.conversationId)
            return c.json({ deleted })
        })
        .delete('/:id/messages/:messageId', (c) => {
            const message = context.conversations.requireMessage(
                c.req.param('id'),
                c.req.param('messageId'),
            )
            context.conversations.deleteMessage(message.id)
            context.illustrationPipeline.handleMessagesRemoved(message.conversationId)
            return c.body(null, 204)
        })
        .get('/:id/messages/:messageId/generations', (c) => {
            const message = context.conversations.requireMessage(
                c.req.param('id'),
                c.req.param('messageId'),
            )
            return c.json({
                generations: context.generations.listByMessage(message.id),
            })
        })
        .put('/:id/messages/:messageId/generation', jsonValidator(GenerationSelectionBody), (c) => {
            const message = context.conversations.requireMessage(
                c.req.param('id'),
                c.req.param('messageId'),
            )
            const updated = context.generations.selectOutput(
                message.id,
                c.req.valid('json').generationId,
            )
            if (!updated) {
                throw new NotFoundError('Completed generation not found')
            }
            return c.json(updated)
        })
        .get('/:id', (c) => c.json(context.conversations.requireConversation(c.req.param('id'))))
        .patch('/:id', jsonValidator(ConversationPatchBody), (c) => {
            const body = c.req.valid('json')
            if (body.promptPresetId && !context.prompts.get(body.promptPresetId)) {
                throw new NotFoundError('Prompt preset not found')
            }
            if (body.boundPersonaId && !context.personas.get(body.boundPersonaId)) {
                throw new NotFoundError('Persona not found')
            }
            if (body.modelPresetId && !context.providers.getModelPreset(body.modelPresetId)) {
                throw new NotFoundError('Model preset not found')
            }
            if (
                body.auxiliaryModelPresetId &&
                !context.providers.getModelPreset(body.auxiliaryModelPresetId)
            ) {
                throw new NotFoundError('Auxiliary model preset not found')
            }
            if (body.modelChainPresetId && !context.modelChains.get(body.modelChainPresetId)) {
                throw new NotFoundError('Model chain preset not found')
            }

            if (body.greetingIndex !== undefined) {
                const conversation = context.conversations.requireConversation(c.req.param('id'))
                const character = context.characters.get(conversation.characterId)
                if (!character) throw new NotFoundError('Character not found')
                const greeting =
                    body.greetingIndex >= 0
                        ? character.alternateGreetings[body.greetingIndex]
                        : character.firstMessage
                if (greeting === undefined) {
                    throw new ValidationError('Greeting does not exist')
                }
                const updated = context.conversations.updateGreeting(
                    conversation.id,
                    body.greetingIndex,
                    greeting,
                )
                if (!updated) {
                    throw new ConflictError(
                        'Greeting can only be changed before the first user message',
                    )
                }
            }

            const conversation = context.conversations.update(c.req.param('id'), body)
            if (!conversation) {
                throw new NotFoundError('Conversation not found')
            }
            return c.json(conversation)
        })
        .delete('/:id/permanent', (c) => {
            const conversationId = c.req.param('id')
            if (context.conversations.isGenerating(conversationId)) {
                throw new ConflictError(
                    'Conversation cannot be deleted while a generation is running',
                )
            }
            if (!context.conversations.delete(conversationId)) {
                throw new NotFoundError('Conversation not found')
            }
            return c.body(null, 204)
        })
        .delete('/:id', (c) => {
            if (!context.conversations.archive(c.req.param('id'))) {
                throw new NotFoundError('Conversation not found')
            }
            return c.body(null, 204)
        })
}
