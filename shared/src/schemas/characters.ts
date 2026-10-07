import { z } from 'zod'

import { IdSchema, TimestampSchema } from './common'
import {
    LoreEntrySchema,
    LoreSettingsSchema,
    LuaScriptInputSchema,
    LuaScriptSchema,
} from './prompt-modules'
import { BiasEntrySchema, RegexScriptSchema } from './prompts'

export const CharacterAssetSchema = z.object({
    assetId: IdSchema,
    type: z.string(),
    name: z.string(),
    extension: z.string(),
    sourceUri: z.string(),
    mimeType: z.string(),
    size: z.number().int().nonnegative(),
})

export const CharacterSchema = z.object({
    id: IdSchema,
    name: z.string(),
    description: z.string(),
    personality: z.string(),
    scenario: z.string(),
    firstMessage: z.string(),
    alternateGreetings: z.array(z.string()),
    exampleMessage: z.string(),
    systemPrompt: z.string(),
    postHistoryInstructions: z.string(),
    creator: z.string(),
    characterVersion: z.string(),
    tags: z.array(z.string()),
    avatarAssetId: IdSchema.nullable(),
    sourceSpec: z.enum(['v2', 'v3']),
    archivedAt: TimestampSchema.nullable(),
    groupId: IdSchema.nullable(),
    sortOrder: z.number().int().nonnegative(),
    lorebook: z.array(LoreEntrySchema).optional(),
    regexScripts: z.array(RegexScriptSchema).default([]),
    moduleReferences: z.array(z.string().max(200)).default([]),
    defaultVariables: z.record(z.string(), z.string()).default({}),
    bias: z.array(BiasEntrySchema).default([]),
    luaScript: LuaScriptSchema.nullable().default(null),
    luaRawTriggers: z.array(z.unknown()).max(10_000).default([]),
    loreSettings: LoreSettingsSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const CharacterUpdateSchema = CharacterSchema.pick({
    name: true,
    description: true,
    personality: true,
    scenario: true,
    firstMessage: true,
    alternateGreetings: true,
    exampleMessage: true,
    systemPrompt: true,
    postHistoryInstructions: true,
    creator: true,
    characterVersion: true,
    tags: true,
    lorebook: true,
    loreSettings: true,
    regexScripts: true,
    moduleReferences: true,
    defaultVariables: true,
    bias: true,
})
    .partial()
    .extend({ luaScript: LuaScriptInputSchema.nullable().optional() })

export const CharacterCreateSchema = z.object({
    name: z.string().min(1).max(500),
    description: z.string().default(''),
    personality: z.string().default(''),
    scenario: z.string().default(''),
    firstMessage: z.string().default(''),
    alternateGreetings: z.array(z.string()).default([]),
    exampleMessage: z.string().default(''),
    systemPrompt: z.string().default(''),
    postHistoryInstructions: z.string().default(''),
    creator: z.string().default(''),
    characterVersion: z.string().default(''),
    tags: z.array(z.string()).default([]),
    lorebook: z
        .array(LoreEntrySchema.omit({ id: true }).extend({ id: IdSchema.optional() }))
        .default([]),
    loreSettings: LoreSettingsSchema.default({}),
    regexScripts: z.array(RegexScriptSchema).max(2_000).default([]),
    moduleReferences: z.array(z.string().max(200)).max(1_000).default([]),
    defaultVariables: z.record(z.string(), z.string()).default({}),
    bias: z.array(BiasEntrySchema).max(10_000).default([]),
    luaScript: LuaScriptInputSchema.nullable().default(null),
})
