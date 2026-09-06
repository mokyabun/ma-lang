import {
    ConversationCreateSchema,
    ConversationOrganizationSchema,
    GroupCreateSchema,
    GroupUpdateSchema,
    LongTermMemorySettingsPatchSchema,
} from '@malang/shared'
import { Hono } from 'hono'
import { z } from 'zod'

import { ConflictError, NotFoundError, ValidationError } from '@/errors'
import type { AppContext } from '@/services'
import { type AppEnv, jsonValidator } from '@/utils'

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

export function createConversationDomain(context: AppContext) {
    return new Hono<AppEnv>()
        .get('/', (c) =>
            c.json({
                conversations: context.store.conversation.list(c.req.query('archived') === 'true'),
                groups: context.store.conversationGroup.list(),
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
            if (
                input.modelChainPresetId &&
                !context.store.modelChain.get(input.modelChainPresetId)
            ) {
                throw new NotFoundError('Model chain preset not found')
            }
            return c.json(context.store.conversation.create(input), 201)
        })
        .post('/groups', jsonValidator(ConversationGroupCreateBody), (c) => {
            const input = c.req.valid('json')
            const group = context.store.conversationGroup.create(input.characterId, input.name)
            if (!group) throw new NotFoundError('Character not found')
            return c.json(group, 201)
        })
        .patch('/groups/:groupId', jsonValidator(GroupUpdateSchema), (c) => {
            const name = c.req.valid('json').name
            if (!name) throw new ValidationError('Group name is required')
            const group = context.store.conversationGroup.update(c.req.param('groupId'), name)
            if (!group) throw new NotFoundError('Chat group not found')
            return c.json(group)
        })
        .delete('/groups/:groupId', (c) => {
            if (!context.store.conversationGroup.delete(c.req.param('groupId'))) {
                throw new NotFoundError('Chat group not found')
            }
            return c.body(null, 204)
        })
        .put('/organization', jsonValidator(ConversationOrganizationSchema), (c) => {
            const input = c.req.valid('json')
            if (!context.store.conversationOrganization.update(input)) {
                throw new ValidationError('Invalid chat organization')
            }
            return c.json({
                conversations: context.store.conversation
                    .list(false)
                    .filter((conversation) => conversation.characterId === input.characterId),
                groups: context.store.conversationGroup.list(input.characterId),
            })
        })
        .post('/:id/restore', (c) => {
            if (!context.store.conversation.restore(c.req.param('id'))) {
                throw new NotFoundError('Conversation not found')
            }
            return c.json(requireConversation(context, c.req.param('id')))
        })
        .get('/:id/generation', (c) => {
            requireConversation(context, c.req.param('id'))
            return c.json({
                generation: context.store.generation.active(c.req.param('id')),
            })
        })
        .get('/:id/messages', async (c) => {
            requireConversation(context, c.req.param('id'))
            return c.json({
                messages: await context.generations.messagesWithDisplay(c.req.param('id')),
            })
        })
        .get('/:id/memory', (c) => {
            requireConversation(context, c.req.param('id'))
            return c.json(context.memory.state(c.req.param('id')))
        })
        .patch('/:id/memory', jsonValidator(LongTermMemorySettingsPatchSchema), (c) => {
            const conversationId = c.req.param('id')
            requireConversation(context, conversationId)
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
            requireConversation(context, c.req.param('id'))
            return c.json({ deleted: context.memory.clear(c.req.param('id')) })
        })
        .patch('/:id/memory/summaries/:summaryId', jsonValidator(MemorySummaryPatchBody), (c) => {
            requireConversation(context, c.req.param('id'))
            const summary = context.memory.updateSummary(
                c.req.param('id'),
                c.req.param('summaryId'),
                c.req.valid('json'),
            )
            if (!summary) throw new NotFoundError('Memory summary not found')
            return c.json(summary)
        })
        .delete('/:id/memory/summaries/:summaryId', (c) => {
            requireConversation(context, c.req.param('id'))
            if (!context.memory.deleteSummary(c.req.param('id'), c.req.param('summaryId'))) {
                throw new NotFoundError('Memory summary not found')
            }
            return c.body(null, 204)
        })
        .get('/:id/modules', (c) => {
            requireConversation(context, c.req.param('id'))
            return c.json({ modules: context.modules.conversationStates(c.req.param('id')) })
        })
        .put('/:id/modules/:moduleId', jsonValidator(ConversationModuleBody), (c) => {
            requireConversation(context, c.req.param('id'))
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
            const message = context.store.message.get(c.req.param('messageId'))
            if (!message || message.conversationId !== c.req.param('id')) {
                throw new NotFoundError('Message not found')
            }
            const updated = context.store.message.update(message.id, {
                content: c.req.valid('json').content,
            })
            if (!updated) throw new NotFoundError('Message not found')
            return c.json(updated)
        })
        .delete('/:id/messages/:messageId/after', (c) => {
            const message = context.store.message.get(c.req.param('messageId'))
            if (!message || message.conversationId !== c.req.param('id')) {
                throw new NotFoundError('Message not found')
            }
            return c.json({
                deleted: context.store.message.truncate(
                    message.conversationId,
                    message.position + 1,
                ),
            })
        })
        .delete('/:id/messages/:messageId/from', (c) => {
            const message = context.store.message.get(c.req.param('messageId'))
            if (!message || message.conversationId !== c.req.param('id')) {
                throw new NotFoundError('Message not found')
            }
            return c.json({
                deleted: context.store.message.truncate(message.conversationId, message.position),
            })
        })
        .delete('/:id/messages/:messageId', (c) => {
            const message = context.store.message.get(c.req.param('messageId'))
            if (!message || message.conversationId !== c.req.param('id')) {
                throw new NotFoundError('Message not found')
            }
            context.store.message.delete(message.id)
            return c.body(null, 204)
        })
        .get('/:id/messages/:messageId/generations', (c) => {
            const message = context.store.message.get(c.req.param('messageId'))
            if (!message || message.conversationId !== c.req.param('id')) {
                throw new NotFoundError('Message not found')
            }
            return c.json({
                generations: context.store.generation.listByMessage(message.id),
            })
        })
        .put('/:id/messages/:messageId/generation', jsonValidator(GenerationSelectionBody), (c) => {
            const message = context.store.message.get(c.req.param('messageId'))
            if (!message || message.conversationId !== c.req.param('id')) {
                throw new NotFoundError('Message not found')
            }
            const updated = context.store.generation.selectOutput(
                message.id,
                c.req.valid('json').generationId,
            )
            if (!updated) {
                throw new NotFoundError('Completed generation not found')
            }
            return c.json(updated)
        })
        .get('/:id', (c) => c.json(requireConversation(context, c.req.param('id'))))
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
            if (body.modelChainPresetId && !context.store.modelChain.get(body.modelChainPresetId)) {
                throw new NotFoundError('Model chain preset not found')
            }

            if (body.greetingIndex !== undefined) {
                const conversation = requireConversation(context, c.req.param('id'))
                const character = context.characters.get(conversation.characterId)
                if (!character) throw new NotFoundError('Character not found')
                const greeting =
                    body.greetingIndex >= 0
                        ? character.alternateGreetings[body.greetingIndex]
                        : character.firstMessage
                if (greeting === undefined) {
                    throw new ValidationError('Greeting does not exist')
                }
                const updated = context.store.conversation.updateGreeting(
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

            const conversation = context.store.conversation.update(c.req.param('id'), body)
            if (!conversation) {
                throw new NotFoundError('Conversation not found')
            }
            return c.json(conversation)
        })
        .delete('/:id/permanent', (c) => {
            const conversationId = c.req.param('id')
            if (context.store.generation.findRunning(conversationId)) {
                throw new ConflictError(
                    'Conversation cannot be deleted while a generation is running',
                )
            }
            if (!context.store.conversation.delete(conversationId)) {
                throw new NotFoundError('Conversation not found')
            }
            return c.body(null, 204)
        })
        .delete('/:id', (c) => {
            if (!context.store.conversation.archive(c.req.param('id'))) {
                throw new NotFoundError('Conversation not found')
            }
            return c.body(null, 204)
        })
}

function requireConversation(context: AppContext, id: string) {
    const conversation = context.store.conversation.get(id)
    if (!conversation) throw new NotFoundError('Conversation not found')
    return conversation
}
