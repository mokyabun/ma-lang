import type { Logger } from 'pino'

import { type AppConfig, loadConfig } from '@/config'
import { openDatabase, Store } from '@/db'
import { createLogger } from '@/logger'

import { AssetStore } from './app/assets'
import { AuthService } from './app/auth'
import { BackupService } from './app/backups'
import { CharacterService } from './app/characters'
import { GenerationService } from './app/generations'
import { PromptModuleService } from './app/modules'
import { PersonaService } from './app/personas'
import { PromptService } from './app/prompts'
import { ProviderService } from './app/providers'
import { SecretVault } from './app/secret-vault'
import { SystemLogService } from './app/system-logs'
import { UploadStore } from './import/uploads'
import { LuaRuntime } from './lua'
import { HypaMemoryV3Service } from './memory'

export * from './app'
export * from './prompt'
export * from './providers'
export * from './memory'

export interface AppContext {
    config: AppConfig
    store: Store
    auth: AuthService
    assets: AssetStore
    uploads: UploadStore
    characters: CharacterService
    personas: PersonaService
    prompts: PromptService
    modules: PromptModuleService
    providers: ProviderService
    generations: GenerationService
    lua: LuaRuntime
    memory: HypaMemoryV3Service
    backups: BackupService
    systemLogs: SystemLogService
    logger: Logger
    close(): void
}

export async function createContext(config: AppConfig = loadConfig()): Promise<AppContext> {
    const store = new Store(openDatabase(config.databasePath))
    store.generation.recoverInterrupted()
    store.settings.ensure()
    store.promptPreset.ensureDefault()
    store.character.ensureGeneralChat()
    const vault = new SecretVault(store)
    const auth = new AuthService(store, config.sessionSecret, vault)
    await auth.bootstrap(config.adminPassword)
    const assetStore = new AssetStore(config.dataDir, store)
    const systemLogs = new SystemLogService(config.dataDir)
    const logger = createLogger(config, systemLogs)
    const backups = new BackupService(config, store, logger.child({ module: 'backups' }), () =>
        vault.lock(),
    )
    const providers = new ProviderService(store, vault)
    const personas = new PersonaService(store, assetStore)
    const lua = new LuaRuntime(store, providers, personas, logger.child({ module: 'lua-runtime' }))
    const memory = new HypaMemoryV3Service(
        store,
        providers,
        logger.child({ module: 'hypa-memory-v3' }),
    )
    backups.start()
    return {
        config,
        store,
        auth,
        assets: assetStore,
        uploads: new UploadStore(config.dataDir, config.limits.uploadChunkBytes),
        characters: new CharacterService(config, store, assetStore),
        personas,
        prompts: new PromptService(store),
        modules: new PromptModuleService(store, config, assetStore),
        providers,
        lua,
        memory,
        backups,
        systemLogs,
        generations: new GenerationService(
            store,
            providers,
            personas,
            lua,
            memory,
            logger.child({ module: 'generation-service' }),
        ),
        logger,
        close: () => {
            backups.close()
            systemLogs.close()
            lua.close()
            store.close()
        },
    }
}
