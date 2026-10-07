import { z } from 'zod'

import { IdSchema, TimestampSchema } from './common'

export const NOVELAI_IMAGE_MODELS = [
    'nai-diffusion-4-5-full',
    'nai-diffusion-4-5-curated',
    'nai-diffusion-4-full',
    'nai-diffusion-4-curated-preview',
] as const

export const NovelAISamplerSchema = z.enum([
    'k_euler',
    'k_euler_ancestral',
    'k_dpmpp_2s_ancestral',
    'k_dpmpp_2m',
    'k_dpmpp_sde',
    'k_dpmpp_2m_sde',
])

export const NovelAINoiseScheduleSchema = z.enum([
    'native',
    'karras',
    'exponential',
    'polyexponential',
])

// NovelAI rejects image sides that are not multiples of 64.
const ImageSideSchema = z.int().min(64).max(2048).multipleOf(64)

export const NovelAIImageParamsSchema = z.object({
    model: z.string().trim().min(1).max(100),
    sampler: NovelAISamplerSchema,
    steps: z.int().min(1).max(50),
    scale: z.number().min(0).max(10),
    cfgRescale: z.number().min(0).max(1),
    noiseSchedule: NovelAINoiseScheduleSchema,
    width: ImageSideSchema,
    height: ImageSideSchema,
    /** Null draws a random seed for every generation. */
    seed: z.int().min(0).max(4_294_967_295).nullable(),
})

export const DEFAULT_NOVELAI_IMAGE_PARAMS: z.infer<typeof NovelAIImageParamsSchema> = {
    model: 'nai-diffusion-4-5-full',
    sampler: 'k_euler_ancestral',
    steps: 28,
    scale: 5,
    cfgRescale: 0,
    noiseSchedule: 'karras',
    width: 832,
    height: 1216,
    seed: null,
}

// NovelAI V4 accepts at most six character captions.
export const MAX_ILLUSTRATION_CHARACTERS = 6

export const DEFAULT_NOVELAI_ENDPOINT = 'https://image.novelai.net'

export const ImageProviderSchema = z.enum(['novelai'])
export const IllustrationModeSchema = z.enum(['manual', 'auto'])
export const ContinuityTrackingSchema = z.enum(['with-illustration', 'every-message'])

// Illustrations per response; min === max means a fixed count.
export const MAX_ILLUSTRATIONS_PER_MESSAGE = 8
const CountValueSchema = z.int().min(1).max(MAX_ILLUSTRATIONS_PER_MESSAGE)
export const IllustrationCountSchema = z
    .object({ min: CountValueSchema, max: CountValueSchema })
    .refine((count) => count.min <= count.max, { message: 'min must not exceed max' })

const TemplateTextSchema = z.string().max(10_000)
const InstructionTextSchema = z.string().max(20_000)

export const ImageSizePresetSchema = z.object({
    /** The name the analysis AI picks, e.g. `portrait`. */
    name: z
        .string()
        .trim()
        .min(1)
        .max(40)
        .regex(/^[\w-]+$/, 'Use letters, digits, `_` or `-`'),
    width: ImageSideSchema,
    height: ImageSideSchema,
})

export const DEFAULT_IMAGE_SIZE_PRESETS: Array<z.infer<typeof ImageSizePresetSchema>> = [
    { name: 'portrait', width: 832, height: 1216 },
    { name: 'landscape', width: 1216, height: 832 },
    { name: 'square', width: 1024, height: 1024 },
]

const IllustrationSettingsFields = {
    analysisModelPresetId: z.uuid().nullable(),
    defaultStyleId: z.uuid().nullable(),
    defaultMode: IllustrationModeSchema,
    defaultCount: IllustrationCountSchema,
    /** Recent messages sent to the analysis AI besides the one being illustrated. */
    contextMessageCount: z.int().min(0).max(50),
    /** Empty uses Malang's built-in instruction. */
    analysisInstruction: InstructionTextSchema,
    /** `<<slot>>` takes the scene prompt; without it this goes in front. */
    fixedPositive: TemplateTextSchema,
    /** `<<slot>>` takes the style negative; without it this goes in front. */
    fixedNegative: TemplateTextSchema,
    sizePresets: z
        .array(ImageSizePresetSchema)
        .min(1)
        .max(8)
        .refine((sizes) => new Set(sizes.map((size) => size.name)).size === sizes.length, {
            message: 'Size names must be unique',
        }),
    continuityTracking: ContinuityTrackingSchema,
}

export const IllustrationSettingsSchema = z.object({
    ...IllustrationSettingsFields,
    imageProvider: ImageProviderSchema,
    novelaiEndpoint: z.url(),
    novelaiApiKeyConfigured: z.boolean(),
    /** The key exists but the vault is locked until the next sign-in. */
    novelaiApiKeyLocked: z.boolean(),
    novelaiApiKeyHint: z.string(),
    defaultImageParams: NovelAIImageParamsSchema,
})

export const IllustrationSettingsPatchSchema = z
    .object({
        ...IllustrationSettingsFields,
        novelaiEndpoint: z.url().max(500),
        novelaiApiKey: z.string().trim().min(1).max(500),
        clearNovelaiApiKey: z.literal(true),
        defaultImageParams: NovelAIImageParamsSchema.partial(),
    })
    .partial()
    .refine((value) => !(value.novelaiApiKey && value.clearNovelaiApiKey), {
        message: 'Set or clear the NovelAI key, not both',
    })

/** Unset parameters fall back to the global defaults. */
export const IllustrationStyleParamsSchema = NovelAIImageParamsSchema.partial()

export const IllustrationStyleInputSchema = z.object({
    name: z.string().trim().min(1).max(100),
    /** `<<slot>>` takes the analysis AI's scene tags. */
    sceneTemplate: TemplateTextSchema,
    negative: TemplateTextSchema,
    params: IllustrationStyleParamsSchema,
    sortOrder: z.int().optional(),
})

export const IllustrationStyleSchema = IllustrationStyleInputSchema.extend({
    id: IdSchema,
    sortOrder: z.int(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const IllustrationStyleTestRequestSchema = z.object({
    scene: TemplateTextSchema,
    characters: z
        .array(z.object({ prompt: TemplateTextSchema, negative: TemplateTextSchema.default('') }))
        .max(MAX_ILLUSTRATION_CHARACTERS)
        .default([]),
})

export const IllustrationOutfitInputSchema = z.object({
    /** Present to keep an existing outfit; absent creates one. */
    id: IdSchema.optional(),
    name: z.string().trim().min(1).max(100),
    prompt: TemplateTextSchema,
    negative: TemplateTextSchema,
    isDefault: z.boolean(),
    enabled: z.boolean(),
})

export const IllustrationOutfitSchema = IllustrationOutfitInputSchema.extend({
    id: IdSchema,
    actorId: IdSchema,
    /** Set for outfits the analysis AI invented in one conversation. */
    conversationId: IdSchema.nullable(),
    sortOrder: z.int(),
})

const ActorKeySchema = z.string().trim().min(1).max(200)

export const IllustrationActorInputSchema = z.object({
    name: z.string().trim().min(1).max(100),
    /** Words that mark this actor as present in the text. */
    keys: z.array(ActorKeySchema).max(50),
    /** `<<slot>>` takes the actor's tags, `<<outfit>>` the outfit, `<<state>>` the state. */
    promptTemplate: TemplateTextSchema,
    negative: TemplateTextSchema,
    enabled: z.boolean(),
    sortOrder: z.int().optional(),
    outfits: z
        .array(IllustrationOutfitInputSchema)
        .max(50)
        .refine((outfits) => outfits.filter((outfit) => outfit.isDefault).length <= 1, {
            message: 'Only one outfit can be the default',
        }),
})

export const IllustrationActorOwnerSchema = z.union([
    z.object({ characterId: IdSchema }),
    z.object({ personaId: IdSchema }),
])

export const IllustrationActorCreateSchema = IllustrationActorInputSchema.extend({
    characterId: IdSchema.optional(),
    personaId: IdSchema.optional(),
}).refine((value) => !value.characterId !== !value.personaId, {
    message: 'Give exactly one of characterId or personaId',
})

export const IllustrationActorSchema = IllustrationActorInputSchema.extend({
    id: IdSchema,
    characterId: IdSchema.nullable(),
    personaId: IdSchema.nullable(),
    sortOrder: z.int(),
    outfits: z.array(IllustrationOutfitSchema),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const ConversationIllustrationSettingsInputSchema = z.object({
    enabled: z.boolean(),
    mode: IllustrationModeSchema,
    count: IllustrationCountSchema,
    /** Null uses the global default style. */
    styleId: IdSchema.nullable(),
    /** Null uses the global analysis model. */
    analysisModelPresetId: IdSchema.nullable(),
    /** Extra staging guidance for the analysis AI in this conversation. */
    sceneDirection: InstructionTextSchema,
})

export const ConversationIllustrationSettingsSchema =
    ConversationIllustrationSettingsInputSchema.extend({ conversationId: IdSchema })

const CaptionTextSchema = z.string().max(10_000)

export const IllustrationTestRequestSchema = z.object({
    positive: CaptionTextSchema,
    negative: CaptionTextSchema.default(''),
    characters: z
        .array(z.object({ prompt: CaptionTextSchema, negative: CaptionTextSchema.default('') }))
        .max(MAX_ILLUSTRATION_CHARACTERS)
        .default([]),
    params: NovelAIImageParamsSchema.partial().optional(),
})

export const IllustrationTestResultSchema = z.object({
    /** `data:` URL; test images are not stored as assets. */
    image: z.string(),
    seed: z.int(),
    width: z.int(),
    height: z.int(),
    model: z.string(),
})

export const MessageIllustrationStatusSchema = z.enum([
    'pending',
    'rendering',
    'complete',
    'failed',
])

/** One illustration slot of a message, as the chat shows it. */
export const MessageIllustrationSchema = z.object({
    id: IdSchema,
    conversationId: IdSchema,
    messageId: IdSchema,
    generationRunId: IdSchema.nullable(),
    slotIndex: z.int(),
    status: MessageIllustrationStatusSchema,
    /** The active revision's image. */
    assetId: IdSchema.nullable(),
    width: z.int(),
    height: z.int(),
    error: z.string().nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
})

export const IllustrateMessageRequestSchema = z.object({
    /** Overrides the conversation's count for this run only. */
    count: IllustrationCountSchema.optional(),
})

export const IllustrationStateKindSchema = z.enum(['flag', 'counter', 'choice'])

const StateKeySchema = z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[\w-]+$/, 'Use letters, digits, `_` or `-`')

export const IllustrationStateDefinitionInputSchema = z
    .object({
        key: StateKeySchema,
        label: z.string().trim().min(1).max(100),
        /** Tells the analysis AI when to set, change or clear this state. */
        instruction: z.string().max(2_000),
        kind: IllustrationStateKindSchema,
        /** `flag`: tags while the state is set. */
        tags: TemplateTextSchema,
        /** `choice`: each value and its tags. */
        options: z
            .array(z.object({ value: z.string().trim().min(1).max(60), tags: TemplateTextSchema }))
            .max(20),
        /** `counter`: tags of the highest threshold the value has reached. */
        thresholds: z.array(z.object({ min: z.number(), tags: TemplateTextSchema })).max(20),
        /** Null keeps the state until cleared; N drops it N responses after it last changed. */
        lifetimeTurns: z.int().min(1).max(100).nullable(),
        sortOrder: z.int().optional(),
    })
    .refine((value) => value.kind !== 'choice' || value.options.length > 0, {
        message: 'A choice state needs at least one option',
        path: ['options'],
    })

export const IllustrationStateDefinitionCreateSchema = z.intersection(
    IllustrationStateDefinitionInputSchema,
    /** Null defines the state for every character. */
    z.object({ characterId: IdSchema.nullable() }),
)

export const IllustrationStateDefinitionSchema = z.intersection(
    IllustrationStateDefinitionInputSchema,
    z.object({
        id: IdSchema,
        characterId: IdSchema.nullable(),
        sortOrder: z.int(),
        createdAt: TimestampSchema,
        updatedAt: TimestampSchema,
    }),
)

export const IllustrationStateValueSchema = z.object({
    value: z.union([z.literal(true), z.number(), z.string()]),
    /** The last response turn the state survives. */
    expiresAfterTurn: z.int().optional(),
})

/** Who is in the scene, what they wear and what has happened to them, keyed by actor id. */
export const IllustrationStateSchema = z.object({
    present: z.array(IdSchema),
    outfits: z.record(IdSchema, z.object({ outfitId: IdSchema.nullable(), locked: z.boolean() })),
    states: z.record(IdSchema, z.record(z.string(), IllustrationStateValueSchema)),
    /** Assistant responses up to and including the snapshot's message. */
    turn: z.int().min(0),
})

export const ConversationContinuitySchema = z.object({
    state: IllustrationStateSchema,
    /** Null until a response is analyzed or the state is edited by hand. */
    source: z.enum(['analysis', 'manual']).nullable(),
    snapshotMessageId: IdSchema.nullable(),
    /** Actors in this conversation; outfits include ones made for it alone. */
    actors: z.array(IllustrationActorSchema),
    definitions: z.array(IllustrationStateDefinitionSchema),
})

export const ContinuityUpdateSchema = IllustrationStateSchema.omit({ turn: true })
