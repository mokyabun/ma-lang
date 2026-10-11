import { type AppConfig, loadConfig } from '@/config'
import type { AppContext } from '@/context'
import { openDatabase, Store } from '@/db'
import { createLogger } from '@/logger'
import { AssetStore } from '@/modules/assets/service'
import { AuthService } from '@/modules/auth/service'
import { CharacterService } from '@/modules/characters/service'
import { ConversationService } from '@/modules/conversations/service'
import { DebugService } from '@/modules/debug/service'
import { GenerationService } from '@/modules/generations/service'
import { IllustrationCatalogService } from '@/modules/illustrations/catalog'
import { ContinuityService } from '@/modules/illustrations/continuity-service'
import { ANALYSIS_LANE, IllustrationPipeline } from '@/modules/illustrations/pipeline'
import { IllustrationService, NOVELAI_LANE } from '@/modules/illustrations/service'
import { JobRunner } from '@/modules/jobs/runner'
import { LuaRuntime } from '@/modules/lua/runtime'
import { HypaMemoryV3Service } from '@/modules/memory/hypa-v3'
import { ModelChainService } from '@/modules/model-chains/service'
import { PersonaService } from '@/modules/personas/service'
import { PromptModuleService } from '@/modules/prompt-modules/service'
import { PromptService } from '@/modules/prompts/service'
import { ProviderService } from '@/modules/providers/service'
import { RuntimeEventHub } from '@/modules/realtime/hub'
import { SecretVault } from '@/modules/secrets/vault'
import { SettingsService } from '@/modules/settings/service'
import { BackupService } from '@/modules/system/backups'
import { SystemLogService } from '@/modules/system/logs'
import { UploadStore } from '@/modules/uploads/service'

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
        modelChains: new ModelChainService(store, providers),
        settings: new SettingsService(store),
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
        debug: new DebugService(store, systemLogs),
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
