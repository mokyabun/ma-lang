import type { z } from 'zod'

import type * as schemas from './schemas'

export type ApiError = z.infer<typeof schemas.ApiErrorSchema>
export type ApiErrorCode = z.infer<typeof schemas.ApiErrorCodeSchema>
export type ProviderConfig = z.infer<typeof schemas.ProviderConfigSchema>
export type ProviderKind = z.infer<typeof schemas.ProviderKindSchema>
export type ProviderApiFormat = z.infer<typeof schemas.ProviderApiFormatSchema>
export type TokenizerId = z.infer<typeof schemas.TokenizerIdSchema>
export type ProviderSettingsInput = z.infer<typeof schemas.ProviderSettingsInputSchema>
export type ProviderSettings = z.infer<typeof schemas.ProviderSettingsSchema>
export type ModelApiKey = z.infer<typeof schemas.ModelApiKeySchema>
export type ModelApiKeyInput = z.infer<typeof schemas.ModelApiKeyInputSchema>
export type ModelPreset = z.infer<typeof schemas.ModelPresetSchema>
export type ModelPresetInput = z.infer<typeof schemas.ModelPresetInputSchema>
export type ModelChainAgent = z.infer<typeof schemas.ModelChainAgentSchema>
export type ModelChainLayer = z.infer<typeof schemas.ModelChainLayerSchema>
export type ModelChainPreset = z.infer<typeof schemas.ModelChainPresetSchema>
export type ModelChainPresetInput = z.infer<typeof schemas.ModelChainPresetInputSchema>
export type ModelChainGraph = z.infer<typeof schemas.ModelChainGraphSchema>
export type ModelDiscoveryInput = z.infer<typeof schemas.ModelDiscoveryInputSchema>
export type PocketRisuProfileField = z.infer<typeof schemas.PocketRisuProfileFieldSchema>
export type PocketRisuModelProfileEnvelope = z.infer<
    typeof schemas.PocketRisuModelProfileEnvelopeSchema
>
export type PocketRisuProfileBinding = z.infer<typeof schemas.PocketRisuProfileBindingSchema>
export type GenerationParameters = z.infer<typeof schemas.GenerationParametersSchema>
export type PromptRole = z.infer<typeof schemas.PromptRoleSchema>
export type ModelRole = z.infer<typeof schemas.ModelRoleSchema>
export type KnownPromptBlock = z.infer<typeof schemas.KnownPromptBlockSchema>
export type PromptBlock = z.infer<typeof schemas.PromptBlockSchema>
export type PromptToggle = z.infer<typeof schemas.PromptToggleSchema>
export type RegexPhase = z.infer<typeof schemas.RegexPhaseSchema>
export type BiasEntry = z.infer<typeof schemas.BiasEntrySchema>
export type RegexScript = z.infer<typeof schemas.RegexScriptSchema>
export type PromptSettings = z.infer<typeof schemas.PromptSettingsSchema>
export type PromptPreset = z.infer<typeof schemas.PromptPresetSchema>
type PromptPresetInputOutput = z.infer<typeof schemas.PromptPresetInputSchema>
export type PromptPresetInput = Omit<
    PromptPresetInputOutput,
    'toggles' | 'regexScripts' | 'moduleIntegrations' | 'bias' | 'promptSettings'
> &
    Partial<
        Pick<
            PromptPresetInputOutput,
            'toggles' | 'regexScripts' | 'moduleIntegrations' | 'bias' | 'promptSettings'
        >
    >
export type ModulePrompt = z.infer<typeof schemas.ModulePromptSchema>
export type ModuleToggle = z.infer<typeof schemas.ModuleToggleSchema>
export type ModuleAsset = z.infer<typeof schemas.ModuleAssetSchema>
export type PromptModule = z.infer<typeof schemas.PromptModuleSchema>
export type LuaScript = z.infer<typeof schemas.LuaScriptSchema>
export type LuaScriptInput = z.infer<typeof schemas.LuaScriptInputSchema>
type PromptModuleInputOutput = z.infer<typeof schemas.PromptModuleInputSchema>
export type LoreEntryInput = Omit<
    LoreEntry,
    | 'position'
    | 'depth'
    | 'role'
    | 'scanDepth'
    | 'recursive'
    | 'probability'
    | 'additionalKeys'
    | 'excludeKeys'
    | 'fullWordMatching'
    | 'decorators'
    | 'isGroup'
> &
    Partial<
        Pick<
            LoreEntry,
            | 'position'
            | 'depth'
            | 'role'
            | 'scanDepth'
            | 'recursive'
            | 'probability'
            | 'additionalKeys'
            | 'excludeKeys'
            | 'fullWordMatching'
            | 'decorators'
            | 'isGroup'
        >
    >
export type PromptModuleInput = Omit<
    PromptModuleInputOutput,
    | 'sourceId'
    | 'regexScripts'
    | 'backgroundEmbedding'
    | 'lorebook'
    | 'runtimeOrder'
    | 'luaScript'
    | 'luaRawTriggers'
> & {
    lorebook: LoreEntryInput[]
} & Partial<
        Pick<
            PromptModuleInputOutput,
            | 'sourceId'
            | 'regexScripts'
            | 'backgroundEmbedding'
            | 'runtimeOrder'
            | 'luaScript'
            | 'luaRawTriggers'
        >
    >
export type ConversationModuleState = z.infer<typeof schemas.ConversationModuleStateSchema>
export type LoreEntry = z.infer<typeof schemas.LoreEntrySchema>
export type LoreSettings = z.infer<typeof schemas.LoreSettingsSchema>
export type CharacterGroup = z.infer<typeof schemas.CharacterGroupSchema>
export type ConversationGroup = z.infer<typeof schemas.ConversationGroupSchema>
export type GroupCreate = z.infer<typeof schemas.GroupCreateSchema>
export type GroupUpdate = z.infer<typeof schemas.GroupUpdateSchema>
export type CharacterOrganization = z.infer<typeof schemas.CharacterOrganizationSchema>
export type ConversationOrganization = z.infer<typeof schemas.ConversationOrganizationSchema>
export type CharacterAsset = z.infer<typeof schemas.CharacterAssetSchema>
export type Character = z.infer<typeof schemas.CharacterSchema>
export type CharacterCreate = z.infer<typeof schemas.CharacterCreateSchema>
export type CharacterUpdate = z.infer<typeof schemas.CharacterUpdateSchema>
export type Persona = z.infer<typeof schemas.PersonaSchema>
export type PersonaCreate = z.infer<typeof schemas.PersonaCreateSchema>
export type PersonaUpdate = z.infer<typeof schemas.PersonaUpdateSchema>
export type EffectivePersona = z.infer<typeof schemas.EffectivePersonaSchema>
export type AppSettings = z.infer<typeof schemas.AppSettingsSchema>
export type RequestDebugSnapshot = z.infer<typeof schemas.RequestDebugSnapshotSchema>
export type RequestDebugRecord = z.infer<typeof schemas.RequestDebugRecordSchema>
export type Message = z.infer<typeof schemas.MessageSchema>
export type LongTermMemorySettings = z.infer<typeof schemas.LongTermMemorySettingsSchema>
export type LongTermMemorySettingsPatch = z.infer<typeof schemas.LongTermMemorySettingsPatchSchema>
export type LongTermMemorySummary = z.infer<typeof schemas.LongTermMemorySummarySchema>
export type LongTermMemoryMetrics = z.infer<typeof schemas.LongTermMemoryMetricsSchema>
export type LongTermMemoryState = z.infer<typeof schemas.LongTermMemoryStateSchema>
export type Conversation = z.infer<typeof schemas.ConversationSchema>
export type ConversationCreate = z.infer<typeof schemas.ConversationCreateSchema>
export type GenerationRequest = z.infer<typeof schemas.GenerationRequestSchema>
export type LuaTriggerRequest = z.infer<typeof schemas.LuaTriggerRequestSchema>
export type LuaRemoteCommandResult = z.infer<typeof schemas.LuaRemoteCommandResultSchema>
export type GenerationRun = z.infer<typeof schemas.GenerationRunSchema>
export type CompiledMessage = z.infer<typeof schemas.CompiledMessageSchema>
export type PromptPreview = z.infer<typeof schemas.PromptPreviewSchema>
export type GenerationEvent = z.infer<typeof schemas.GenerationEventSchema>

/** Server-sent events for an import request made with `Accept: text/event-stream`. */
export type ImportEvent<T = unknown> =
    | { type: 'import.progress'; stage: 'reading' }
    | { type: 'import.progress'; stage: 'assets'; done: number; total: number }
    | { type: 'import.completed'; status: number; result: T }
    | { type: 'import.failed'; status: number; error: ApiError }
export type NovelAIImageParams = z.infer<typeof schemas.NovelAIImageParamsSchema>
export type NovelAISampler = z.infer<typeof schemas.NovelAISamplerSchema>
export type NovelAINoiseSchedule = z.infer<typeof schemas.NovelAINoiseScheduleSchema>
export type IllustrationSettings = z.infer<typeof schemas.IllustrationSettingsSchema>
export type IllustrationSettingsPatch = z.infer<typeof schemas.IllustrationSettingsPatchSchema>
export type IllustrationTestRequest = z.input<typeof schemas.IllustrationTestRequestSchema>
export type IllustrationTestResult = z.infer<typeof schemas.IllustrationTestResultSchema>
export type BackgroundJobStatus = z.infer<typeof schemas.BackgroundJobStatusSchema>
export type BackgroundJobError = z.infer<typeof schemas.BackgroundJobErrorSchema>
export type BackgroundJob = z.infer<typeof schemas.BackgroundJobSchema>
export type RuntimeEvent = z.infer<typeof schemas.RuntimeEventSchema>
export type IllustrationMode = z.infer<typeof schemas.IllustrationModeSchema>
export type ContinuityTracking = z.infer<typeof schemas.ContinuityTrackingSchema>
export type IllustrationCount = z.infer<typeof schemas.IllustrationCountSchema>
export type ImageSizePreset = z.infer<typeof schemas.ImageSizePresetSchema>
export type IllustrationStyleParams = z.infer<typeof schemas.IllustrationStyleParamsSchema>
export type IllustrationStyleInput = z.infer<typeof schemas.IllustrationStyleInputSchema>
export type IllustrationStyle = z.infer<typeof schemas.IllustrationStyleSchema>
export type IllustrationStyleTestRequest = z.input<
    typeof schemas.IllustrationStyleTestRequestSchema
>
export type IllustrationOutfitInput = z.infer<typeof schemas.IllustrationOutfitInputSchema>
export type IllustrationOutfit = z.infer<typeof schemas.IllustrationOutfitSchema>
export type IllustrationActorInput = z.infer<typeof schemas.IllustrationActorInputSchema>
export type IllustrationActorOwner = z.infer<typeof schemas.IllustrationActorOwnerSchema>
export type IllustrationActorCreate = z.infer<typeof schemas.IllustrationActorCreateSchema>
export type IllustrationActor = z.infer<typeof schemas.IllustrationActorSchema>
export type ConversationIllustrationSettingsInput = z.infer<
    typeof schemas.ConversationIllustrationSettingsInputSchema
>
export type ConversationIllustrationSettings = z.infer<
    typeof schemas.ConversationIllustrationSettingsSchema
>
export type MessageIllustrationStatus = z.infer<typeof schemas.MessageIllustrationStatusSchema>
export type MessageIllustration = z.infer<typeof schemas.MessageIllustrationSchema>
export type IllustrateMessageRequest = z.infer<typeof schemas.IllustrateMessageRequestSchema>
export type IllustrationStateKind = z.infer<typeof schemas.IllustrationStateKindSchema>
export type IllustrationStateDefinitionInput = z.infer<
    typeof schemas.IllustrationStateDefinitionInputSchema
>
export type IllustrationStateDefinitionCreate = z.infer<
    typeof schemas.IllustrationStateDefinitionCreateSchema
>
export type IllustrationStateDefinition = z.infer<typeof schemas.IllustrationStateDefinitionSchema>
export type IllustrationStateValue = z.infer<typeof schemas.IllustrationStateValueSchema>
export type IllustrationState = z.infer<typeof schemas.IllustrationStateSchema>
export type ConversationContinuity = z.infer<typeof schemas.ConversationContinuitySchema>
export type ContinuityUpdate = z.infer<typeof schemas.ContinuityUpdateSchema>
