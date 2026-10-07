import { z } from 'zod'

import { IdSchema, TimestampSchema } from './common'
import { GenerationParametersSchema } from './providers'

export const PromptRoleSchema = z.enum(['user', 'bot', 'system'])
export const ModelRoleSchema = z.enum(['user', 'assistant', 'system'])

const PromptBlockBaseSchema = z.object({
    id: z.string().min(1),
    enabled: z.boolean().default(true),
    name: z.string().max(200).optional(),
})

export const PlainPromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.enum(['plain', 'jailbreak', 'cot']),
    type2: z.enum(['normal', 'globalNote', 'main']).default('normal'),
    text: z.string(),
    role: PromptRoleSchema.default('system'),
})

export const SlotPromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.enum(['persona', 'description', 'lorebook', 'postEverything']),
    innerFormat: z.string().optional(),
    role2: PromptRoleSchema.optional(),
})

export const AuthorNotePromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.literal('authornote'),
    innerFormat: z.string().optional(),
    defaultText: z.string().optional(),
    role2: PromptRoleSchema.optional(),
})

export const ChatPromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.literal('chat'),
    rangeStart: z.number().int(),
    rangeEnd: z.union([z.number().int(), z.literal('end')]),
    chatAsOriginalOnSystem: z.boolean().optional(),
})

export const ChatMlPromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.literal('chatML'),
    text: z.string(),
})

export const KnownPromptBlockSchema = z.discriminatedUnion('type', [
    PlainPromptBlockSchema,
    SlotPromptBlockSchema,
    AuthorNotePromptBlockSchema,
    ChatPromptBlockSchema,
    ChatMlPromptBlockSchema,
])

export const PreservedPromptBlockSchema = PromptBlockBaseSchema.extend({
    type: z.string(),
    enabled: z.literal(false),
    raw: z.record(z.string(), z.unknown()),
})

export const PromptBlockSchema = z.union([KnownPromptBlockSchema, PreservedPromptBlockSchema])

export const PromptToggleSchema = z.object({
    key: z.string().max(100).default(''),
    label: z.string().max(200).default(''),
    type: z.enum([
        'boolean',
        'select',
        'text',
        'textarea',
        'group',
        'groupEnd',
        'divider',
        'caption',
    ]),
    options: z.array(z.string().max(500)).max(200).default([]),
    defaultValue: z.string().max(100_000).default(''),
})

export const RegexPhaseSchema = z.enum(['editinput', 'editprocess', 'editoutput', 'editdisplay'])

// PocketRisu's `[string, value]` bias pair: -100..100, or -101 for a strong ban.
export const BiasEntrySchema = z.tuple([z.string().max(100_000), z.number()])

export const RegexScriptSchema = z.object({
    id: z.string().min(1),
    comment: z.string().max(10_000).default(''),
    pattern: z.string().max(262_144),
    replacement: z.string().max(1_000_000),
    phase: RegexPhaseSchema,
    enabled: z.boolean().default(true),
    flags: z.string().max(500).default(''),
    disabledReason: z.string().max(10_000).optional(),
    raw: z.record(z.string(), z.unknown()).optional(),
})

export const PromptSettingsSchema = z.object({
    assistantPrefill: z.string().max(1_000_000).default(''),
    postEndInnerFormat: z.string().max(1_000_000).default(''),
    sendChatAsSystem: z.boolean().default(false),
    sendName: z.boolean().default(false),
    trimStartNewChat: z.boolean().default(false),
    /**
     * RisuAI wraps every non-greeting history message in this template when `sendName` is on
     * (default `<{{char}}'s Message>\n{{slot}}\n</{{char}}'s Message>`, `{{char}}` is always the
     * character's name even for user turns). Stored at the top level of a RisuAI preset export,
     * not nested under promptSettings — see preset-codec.ts.
     */
    groupTemplate: z.string().max(1_000_000).default(''),
})

export const PromptPresetSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(200),
    blocks: z.array(PromptBlockSchema).max(1_000),
    parameters: GenerationParametersSchema,
    defaultVariables: z.record(z.string(), z.string()),
    toggles: z.array(PromptToggleSchema).max(1_000).default([]),
    regexScripts: z.array(RegexScriptSchema).max(2_000).default([]),
    moduleIntegrations: z.array(z.string().max(200)).max(1_000).default([]),
    bias: z.array(BiasEntrySchema).max(10_000).default([]),
    promptSettings: PromptSettingsSchema.default({
        assistantPrefill: '',
        postEndInnerFormat: '',
        sendChatAsSystem: false,
        sendName: false,
        trimStartNewChat: false,
        groupTemplate: '',
    }),
    warnings: z.array(z.string()),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const PromptPresetInputSchema = PromptPresetSchema.omit({
    id: true,
    warnings: true,
    createdAt: true,
    updatedAt: true,
})
