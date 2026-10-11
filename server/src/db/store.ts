import { AssetRepository } from '@/modules/assets/repo'
import { AdminRepository } from '@/modules/auth/repos/admin'
import { CredentialRotationRepository } from '@/modules/auth/repos/credential-rotation'
import { SessionRepository } from '@/modules/auth/repos/sessions'
import { CharacterAssetRepository } from '@/modules/characters/repos/character-assets'
import { CharacterGroupRepository } from '@/modules/characters/repos/character-groups'
import { CharacterLoreRepository } from '@/modules/characters/repos/character-lore'
import { CharacterOrganizationRepository } from '@/modules/characters/repos/character-organization'
import { CharacterRepository } from '@/modules/characters/repos/characters'
import { ConversationGroupRepository } from '@/modules/conversations/repos/conversation-groups'
import { ConversationLoreRepository } from '@/modules/conversations/repos/conversation-lore'
import { ConversationModuleRepository } from '@/modules/conversations/repos/conversation-modules'
import { ConversationOrganizationRepository } from '@/modules/conversations/repos/conversation-organization'
import { ConversationRepository } from '@/modules/conversations/repos/conversations'
import { MessageRepository } from '@/modules/conversations/repos/messages'
import { RequestDebugRepository } from '@/modules/debug/repo'
import { ModelChainMemoryRepository } from '@/modules/model-chains/repos/model-chain-memory'
import { ModelChainRepository } from '@/modules/model-chains/repos/model-chains'
import { ModelPresetRepository } from '@/modules/model-presets/repo'
import { PersonaRepository } from '@/modules/personas/repo'
import { PromptModuleAssetRepository } from '@/modules/prompt-modules/repos/prompt-module-assets'
import { PromptModuleRepository } from '@/modules/prompt-modules/repos/prompt-modules'
import { PromptPresetRepository } from '@/modules/prompts/repo'
import { ModelApiKeyRepository } from '@/modules/providers/repos/model-api-keys'
import { ProviderRepository } from '@/modules/providers/repos/provider'
import { SecretStorageRepository } from '@/modules/secrets/repo'
import { SettingsRepository } from '@/modules/settings/repo'

import type { DatabaseHandle } from './client'
import { BackgroundJobRepository } from './repositories/background-jobs'
import { ConversationIllustrationSettingsRepository } from './repositories/conversation-illustration-settings'
import { GenerationRepository } from './repositories/generations'
import { IllustrationActorRepository } from './repositories/illustration-actors'
import {
    IllustrationSnapshotRepository,
    IllustrationStateDefinitionRepository,
} from './repositories/illustration-continuity'
import { IllustrationSettingsRepository } from './repositories/illustration-settings'
import { IllustrationStyleRepository } from './repositories/illustration-styles'
import { LuaDisplayBatchRepository } from './repositories/lua-display-batches'
import { LuaRemoteCommandRepository } from './repositories/lua-remote-commands'
import { LuaRunRepository } from './repositories/lua-runs'
import { LuaStateRepository } from './repositories/lua-states'
import { MemoryMetricsRepository } from './repositories/memory-metrics'
import { MemorySettingsRepository } from './repositories/memory-settings'
import { MemorySummaryRepository } from './repositories/memory-summaries'
import { MessageIllustrationRepository } from './repositories/message-illustrations'

export { LuaRevisionConflictError } from './repository'
export type { NewConversationRecord } from '@/modules/conversations/repos/conversations'
export type { AssetRecord } from '@/modules/assets/repo'
export type { BackgroundJobRecord, NewBackgroundJob } from './repositories/background-jobs'
export type { StateSnapshotRecord } from './repositories/illustration-continuity'
export type { IllustrationSettingsRecord } from './repositories/illustration-settings'
export type {
    MessageIllustrationRecord,
    NewMessageIllustration,
} from './repositories/message-illustrations'
export type { SecretEnvelopes, SecretSlot } from '@/modules/secrets/repo'
export type { LuaRemoteCommandRow } from './repositories/lua-remote-commands'
export type { PromptModuleAssetRecord } from '@/modules/prompt-modules/repos/prompt-module-assets'
export type { MemorySummaryRecord, SparseVector } from './repositories/memory-summaries'

export class Store {
    readonly admin: AdminRepository
    readonly session: SessionRepository
    readonly credentialRotation: CredentialRotationRepository
    readonly settings: SettingsRepository
    readonly persona: PersonaRepository
    readonly provider: ProviderRepository
    readonly modelPreset: ModelPresetRepository
    readonly modelApiKey: ModelApiKeyRepository
    readonly secretStorage: SecretStorageRepository
    readonly promptPreset: PromptPresetRepository
    readonly promptModule: PromptModuleRepository
    readonly promptModuleAsset: PromptModuleAssetRepository
    readonly asset: AssetRepository
    readonly character: CharacterRepository
    readonly characterAsset: CharacterAssetRepository
    readonly characterLore: CharacterLoreRepository
    readonly characterGroup: CharacterGroupRepository
    readonly characterOrganization: CharacterOrganizationRepository
    readonly conversation: ConversationRepository
    readonly conversationGroup: ConversationGroupRepository
    readonly conversationLore: ConversationLoreRepository
    readonly conversationModule: ConversationModuleRepository
    readonly conversationOrganization: ConversationOrganizationRepository
    readonly message: MessageRepository
    readonly generation: GenerationRepository
    readonly requestDebug: RequestDebugRepository
    readonly memorySettings: MemorySettingsRepository
    readonly memoryMetrics: MemoryMetricsRepository
    readonly memorySummary: MemorySummaryRepository
    readonly modelChain: ModelChainRepository
    readonly modelChainMemory: ModelChainMemoryRepository
    readonly luaRun: LuaRunRepository
    readonly luaState: LuaStateRepository
    readonly luaDisplayBatch: LuaDisplayBatchRepository
    readonly luaRemoteCommand: LuaRemoteCommandRepository
    readonly backgroundJob: BackgroundJobRepository
    readonly illustrationSettings: IllustrationSettingsRepository
    readonly illustrationStyle: IllustrationStyleRepository
    readonly illustrationActor: IllustrationActorRepository
    readonly conversationIllustrationSettings: ConversationIllustrationSettingsRepository
    readonly messageIllustration: MessageIllustrationRepository
    readonly illustrationStateDefinition: IllustrationStateDefinitionRepository
    readonly illustrationSnapshot: IllustrationSnapshotRepository

    constructor(private readonly handle: DatabaseHandle) {
        this.admin = new AdminRepository(handle)
        this.session = new SessionRepository(handle)
        this.credentialRotation = new CredentialRotationRepository(handle)
        this.settings = new SettingsRepository(handle)
        this.persona = new PersonaRepository(handle)
        this.provider = new ProviderRepository(handle)
        this.modelPreset = new ModelPresetRepository(handle)
        this.modelApiKey = new ModelApiKeyRepository(handle)
        this.secretStorage = new SecretStorageRepository(handle)
        this.promptPreset = new PromptPresetRepository(handle)
        this.promptModule = new PromptModuleRepository(handle)
        this.promptModuleAsset = new PromptModuleAssetRepository(handle)
        this.asset = new AssetRepository(handle)
        this.character = new CharacterRepository(handle)
        this.characterAsset = new CharacterAssetRepository(handle)
        this.characterLore = new CharacterLoreRepository(handle)
        this.characterGroup = new CharacterGroupRepository(handle)
        this.characterOrganization = new CharacterOrganizationRepository(handle)
        this.conversation = new ConversationRepository(handle)
        this.conversationGroup = new ConversationGroupRepository(handle)
        this.conversationLore = new ConversationLoreRepository(handle)
        this.conversationModule = new ConversationModuleRepository(handle)
        this.conversationOrganization = new ConversationOrganizationRepository(handle)
        this.message = new MessageRepository(handle)
        this.generation = new GenerationRepository(handle)
        this.requestDebug = new RequestDebugRepository(handle)
        this.memorySettings = new MemorySettingsRepository(handle)
        this.memoryMetrics = new MemoryMetricsRepository(handle)
        this.memorySummary = new MemorySummaryRepository(handle)
        this.modelChain = new ModelChainRepository(handle)
        this.modelChainMemory = new ModelChainMemoryRepository(handle)
        this.luaRun = new LuaRunRepository(handle)
        this.luaState = new LuaStateRepository(handle)
        this.luaDisplayBatch = new LuaDisplayBatchRepository(handle)
        this.luaRemoteCommand = new LuaRemoteCommandRepository(handle)
        this.backgroundJob = new BackgroundJobRepository(handle)
        this.illustrationSettings = new IllustrationSettingsRepository(handle)
        this.illustrationStyle = new IllustrationStyleRepository(handle)
        this.illustrationActor = new IllustrationActorRepository(handle)
        this.conversationIllustrationSettings = new ConversationIllustrationSettingsRepository(
            handle,
        )
        this.messageIllustration = new MessageIllustrationRepository(handle)
        this.illustrationStateDefinition = new IllustrationStateDefinitionRepository(handle)
        this.illustrationSnapshot = new IllustrationSnapshotRepository(handle)
    }

    /** Runs `fn` atomically; nested calls become savepoints. */
    transaction<T>(fn: () => T): T {
        return this.handle.sqlite.transaction(fn)()
    }
}
