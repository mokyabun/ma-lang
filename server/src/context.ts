import type { Logger } from 'pino'

import type { AppConfig } from '@/config'
import type { DatabaseHandle, Store } from '@/db'
import type { AssetStore } from '@/modules/assets/service'
import type { AuthService } from '@/modules/auth/service'
import type { CharacterService } from '@/modules/characters/service'
import type { ConversationService } from '@/modules/conversations/service'
import type { GenerationService } from '@/modules/generations/service'
import type { IllustrationCatalogService } from '@/modules/illustrations/catalog'
import type { ContinuityService } from '@/modules/illustrations/continuity-service'
import type { IllustrationPipeline } from '@/modules/illustrations/pipeline'
import type { IllustrationService } from '@/modules/illustrations/service'
import type { JobRunner } from '@/modules/jobs/runner'
import type { LuaRuntime } from '@/modules/lua/runtime'
import type { HypaMemoryV3Service } from '@/modules/memory/hypa-v3'
import type { PersonaService } from '@/modules/personas/service'
import type { PromptModuleService } from '@/modules/prompt-modules/service'
import type { PromptService } from '@/modules/prompts/service'
import type { ProviderService } from '@/modules/providers/service'
import type { RuntimeEventHub } from '@/modules/realtime/hub'
import type { BackupService } from '@/modules/system/backups'
import type { SystemLogService } from '@/modules/system/logs'
import type { UploadStore } from '@/modules/uploads/service'

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
