import type { DatabaseHandle } from './db'
import { AdminRepository } from './repositories/admin'
import { AssetRepository } from './repositories/assets'
import { CharacterAssetRepository } from './repositories/character-assets'
import { CharacterGroupRepository } from './repositories/character-groups'
import { CharacterLoreRepository } from './repositories/character-lore'
import { CharacterOrganizationRepository } from './repositories/character-organization'
import { CharacterRepository } from './repositories/characters'
import { ConversationGroupRepository } from './repositories/conversation-groups'
import { ConversationLoreRepository } from './repositories/conversation-lore'
import { ConversationModuleRepository } from './repositories/conversation-modules'
import { ConversationOrganizationRepository } from './repositories/conversation-organization'
import { ConversationRepository } from './repositories/conversations'
import { CredentialRotationRepository } from './repositories/credential-rotation'
import { GenerationRepository } from './repositories/generations'
import { LuaDisplayBatchRepository } from './repositories/lua-display-batches'
import { LuaRemoteCommandRepository } from './repositories/lua-remote-commands'
import { LuaRunRepository } from './repositories/lua-runs'
import { LuaStateRepository } from './repositories/lua-states'
import { MemoryMetricsRepository } from './repositories/memory-metrics'
import { MemorySettingsRepository } from './repositories/memory-settings'
import { MemorySummaryRepository } from './repositories/memory-summaries'
import { MessageRepository } from './repositories/messages'
import { ModelApiKeyRepository } from './repositories/model-api-keys'
import { ModelChainMemoryRepository } from './repositories/model-chain-memory'
import { ModelChainRepository } from './repositories/model-chains'
import { ModelPresetRepository } from './repositories/model-presets'
import { PersonaRepository } from './repositories/personas'
import { PromptModuleAssetRepository } from './repositories/prompt-module-assets'
import { PromptModuleRepository } from './repositories/prompt-modules'
import { PromptPresetRepository } from './repositories/prompt-presets'
import { ProviderRepository } from './repositories/provider'
import { RequestDebugRepository } from './repositories/request-debug'
import { SecretStorageRepository } from './repositories/secret-storage'
import { SessionRepository } from './repositories/sessions'
import { SettingsRepository } from './repositories/settings'

export { LuaRevisionConflictError } from './repositories/base'
export {
    type CharacterAssetRecord,
    type CharacterRecord,
    loreFieldsFromExtensions,
    type NewCharacterRecord,
} from './repositories/characters'
export type { NewConversationRecord } from './repositories/conversations'
export type { AssetRecord } from './repositories/assets'
export type { LuaRemoteCommandRow } from './repositories/lua-remote-commands'
export type { PromptModuleAssetRecord } from './repositories/prompt-module-assets'
export type { MemorySummaryRecord, SparseVector } from './repositories/memory-summaries'

/**
 * The application's repositories over one database connection. Connection lifecycle (backup,
 * restore, close) belongs to the `DatabaseHandle` owner, not to the repositories' callers.
 */
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
    }

    /**
     * Runs `fn` atomically. Repositories share one connection, so every repository call inside
     * `fn` joins the transaction; nested transactions become savepoints.
     */
    transaction<T>(fn: () => T): T {
        return this.handle.sqlite.transaction(fn)()
    }
}
