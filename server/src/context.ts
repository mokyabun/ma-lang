import type { Logger } from 'pino'

import type { AppConfig } from '@/config'
import type { DatabaseHandle, Store } from '@/db'
import type { AssetStore } from '@/modules/assets/service'
import type { AuthService } from '@/modules/auth/service'
import type { PersonaService } from '@/modules/personas/service'
import type { ProviderService } from '@/modules/providers/service'
import type { BackupService } from '@/modules/system/backups'
import type { SystemLogService } from '@/modules/system/logs'
import type { UploadStore } from '@/modules/uploads/service'
import type { CharacterService } from '@/services/app/characters'
import type { ConversationService } from '@/services/app/conversations'
import type { GenerationService } from '@/services/app/generations'
import type { PromptModuleService } from '@/services/app/modules'
import type { PromptService } from '@/services/app/prompts'
import type { RuntimeEventHub } from '@/services/app/runtime-events'
import type {
    ContinuityService,
    IllustrationCatalogService,
    IllustrationPipeline,
    IllustrationService,
} from '@/services/illustration'
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
