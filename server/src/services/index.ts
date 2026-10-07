import type { Logger } from 'pino'

import { type AppConfig, loadConfig } from '@/config'
import { type DatabaseHandle, openDatabase, Store } from '@/db'
import { createLogger } from '@/logger'

import { AssetStore } from './app/assets'
import { AuthService } from './app/auth'
import { BackupService } from './app/backups'
import { CharacterService } from './app/characters'
import { ConversationService } from './app/conversations'
import { GenerationService } from './app/generations'
import { PromptModuleService } from './app/modules'
import { PersonaService } from './app/personas'
import { PromptService } from './app/prompts'
import { ProviderService } from './app/providers'
import { RuntimeEventHub } from './app/runtime-events'
import { SecretVault } from './app/secret-vault'
import { SystemLogService } from './app/system-logs'
import {
    ANALYSIS_LANE,
    ContinuityService,
    IllustrationCatalogService,
    IllustrationPipeline,
    IllustrationService,
    NOVELAI_LANE,
} from './illustration'
import { UploadStore } from './import/uploads'
import { JobRunner } from './jobs'
import { LuaRuntime } from './lua'
import { HypaMemoryV3Service } from './memory'

export * from './app'
export * from './prompt'
export * from './providers'
export * from './memory'

export interface AppContext {
    config: AppConfig
    database: DatabaseHandle
    store: Store
    auth: AuthService
    assets: AssetStore
    uploads: UploadStore
    characters: CharacterService
    conversations: ConversationService
    personas: PersonaService
    prompts: PromptService
    modules: PromptModuleService
    providers: ProviderService
    generations: GenerationService
    lua: LuaRuntime
    memory: HypaMemoryV3Service
    events: RuntimeEventHub
    jobs: JobRunner
    illustrations: IllustrationService
    illustrationCatalog: IllustrationCatalogService
    illustrationPipeline: IllustrationPipeline
    continuity: ContinuityService
    backups: BackupService
    systemLogs: SystemLogService
    logger: Logger
    close(): void
}

export async function createContext(config: AppConfig = loadConfig()): Promise<AppContext> {
    const database = openDatabase(config.databasePath)
    const store = new Store(database)
    store.generation.recoverInterrupted()
    store.settings.ensure()
    const assetStore = new AssetStore(config.dataDir, store)
    const prompts = new PromptService(store)
    const conversations = new ConversationService(store, prompts)
    const characters = new CharacterService(config, store, assetStore, conversations)
    prompts.ensureDefault()
    characters.ensureGeneralChat()
    const vault = new SecretVault(store)
    const auth = new AuthService(store, config.sessionSecret, vault)
    await auth.bootstrap(config.adminPassword)
    const systemLogs = new SystemLogService(config.dataDir)
    const logger = createLogger(config, systemLogs)
    const backups = new BackupService(
        config,
        database,
        store,
        logger.child({ module: 'backups' }),
        () => vault.lock(),
    )
    const providers = new ProviderService(store, vault)
    const personas = new PersonaService(store, assetStore)
    const events = new RuntimeEventHub()
    const lua = new LuaRuntime(
        store,
        providers,
        personas,
        logger.child({ module: 'lua-runtime' }),
        events,
    )
    const jobs = new JobRunner(store, events, logger.child({ module: 'jobs' }), {
        lanes: { [NOVELAI_LANE]: 1, [ANALYSIS_LANE]: 2 },
    })
    const illustrations = new IllustrationService(store, vault, jobs)
    const memory = new HypaMemoryV3Service(
        store,
        providers,
        logger.child({ module: 'hypa-memory-v3' }),
    )
    const generations = new GenerationService(
        store,
        providers,
        personas,
        lua,
        memory,
        logger.child({ module: 'generation-service' }),
    )
    const continuity = new ContinuityService(store, events)
    const illustrationPipeline = new IllustrationPipeline(
        store,
        providers,
        illustrations,
        continuity,
        jobs,
        assetStore,
        events,
        logger.child({ module: 'illustrations' }),
    )
    generations.onCompleted((event) => illustrationPipeline.handleCompleted(event))
    generations.onRegenerating((messageId) => illustrationPipeline.handleRegenerating(messageId))
    backups.start()
    jobs.start()
    return {
        config,
        database,
        store,
        auth,
        assets: assetStore,
        uploads: new UploadStore(config.dataDir, config.limits.uploadChunkBytes),
        characters,
        conversations,
        personas,
        prompts,
        modules: new PromptModuleService(store, config, assetStore),
        providers,
        lua,
        memory,
        events,
        jobs,
        illustrations,
        illustrationCatalog: new IllustrationCatalogService(store),
        illustrationPipeline,
        continuity,
        backups,
        systemLogs,
        generations,
        logger,
        close: () => {
            jobs.close()
            backups.close()
            systemLogs.close()
            lua.close()
            database.close()
        },
    }
}
