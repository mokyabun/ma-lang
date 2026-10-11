import type { Logger } from 'pino'

import type { AppConfig } from '@/config'
import type { DatabaseHandle, Store } from '@/db'
import type { AssetStore } from '@/services/app/assets'
import type { AuthService } from '@/services/app/auth'
import type { BackupService } from '@/services/app/backups'
import type { CharacterService } from '@/services/app/characters'
import type { ConversationService } from '@/services/app/conversations'
import type { GenerationService } from '@/services/app/generations'
import type { PromptModuleService } from '@/services/app/modules'
import type { PersonaService } from '@/services/app/personas'
import type { PromptService } from '@/services/app/prompts'
import type { ProviderService } from '@/services/app/providers'
import type { RuntimeEventHub } from '@/services/app/runtime-events'
import type { SystemLogService } from '@/services/app/system-logs'
import type {
    ContinuityService,
    IllustrationCatalogService,
    IllustrationPipeline,
    IllustrationService,
} from '@/services/illustration'
import type { UploadStore } from '@/services/import/uploads'
import type { JobRunner } from '@/services/jobs'
import type { LuaRuntime } from '@/services/lua'
import type { HypaMemoryV3Service } from '@/services/memory'

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
