import type {
    ApiError,
    AppSettings,
    Character,
    CharacterAsset,
    CharacterCreate,
    CharacterGroup,
    CharacterOrganization,
    CharacterUpdate,
    Conversation,
    ConversationGroup,
    ConversationOrganization,
    GenerationEvent,
    GenerationRequest,
    GenerationRun,
    LuaTriggerRequest,
    LongTermMemorySettings,
    LongTermMemoryState,
    LongTermMemorySummary,
    Message,
    ModelApiKey,
    ModelApiKeyInput,
    ModelDiscoveryInput,
    ModelPreset,
    ModelPresetInput,
    ModelChainPreset,
    ModelChainPresetInput,
    ConversationModuleState,
    Persona,
    PersonaCreate,
    PersonaUpdate,
    PromptModule,
    PromptModuleInput,
    PromptPresetInput,
    PromptPreset,
    PromptPreview,
    ProviderSettings,
    ProviderSettingsInput,
    RequestDebugRecord,
} from '@malang/shared'

const configuredBase = import.meta.env.VITE_API_BASE_URL as string | undefined
export const API_BASE = (configuredBase || '/api/v1').replace(/\/$/, '')

let memoryClientInstanceId: string | undefined
export function getClientInstanceId(): string {
    if (typeof sessionStorage === 'undefined')
        return (memoryClientInstanceId ??= crypto.randomUUID())
    const key = 'malang.clientInstanceId'
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const created = crypto.randomUUID()
    sessionStorage.setItem(key, created)
    return created
}

export class ApiClientError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code?: ApiError['code'],
    ) {
        super(message)
    }
}

export interface BackupSnapshot {
    id: string
    createdAt: number
    size: number
    kind: 'automatic' | 'manual' | 'beforeRestore'
}

export interface SystemLogEntry {
    id: number
    timestamp: number
    level: 'debug' | 'info' | 'warning' | 'error'
    message: string
    module: string | null
    event: string | null
    details: string | null
}

export interface ProviderRequestLog {
    id: string
    conversationId: string
    conversationTitle: string | null
    source: 'chat'
    status: 'running' | 'complete' | 'cancelled' | 'failed'
    statusCode: number
    provider: string
    modelId: string
    inputTokens: number | null
    outputTokens: number | null
    errorCode: string | null
    errorMessage: string | null
    startedAt: string
    completedAt: string | null
    durationMs: number | null
    hasDetails: boolean
}

export interface ProviderRequestLogDetail extends ProviderRequestLog {
    response: string
    requests: Array<{ request: unknown; parameters: unknown }>
}

export interface UsageAggregate {
    requests: number
    failed: number
    inputTokens: number
    outputTokens: number
    avgDurationMs: number | null
}

export interface UsageStatistics {
    totals: UsageAggregate
    days: Array<UsageAggregate & { date: string }>
    models: Array<UsageAggregate & { provider: string; modelId: string }>
    sources: Array<UsageAggregate & { source: 'chat' }>
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
        headers.set('content-type', 'application/json')
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        credentials: 'include',
        headers,
    })
    if (!response.ok) throw await responseError(response)
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
}

async function requestBlob(path: string): Promise<Blob> {
    const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' })
    if (!response.ok) throw await responseError(response)
    return response.blob()
}

async function responseError(response: Response): Promise<ApiClientError> {
    try {
        const body = (await response.json()) as Partial<ApiError>
        return new ApiClientError(body.message || response.statusText, response.status, body.code)
    } catch {
        return new ApiClientError(response.statusText || 'Request failed', response.status)
    }
}

export const api = {
    session: () => request<{ authenticated: boolean }>('/auth/session'),
    login: (password: string) =>
        request<{ authenticated: boolean; expiresAt: string }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ password }),
        }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    characters: (archived = false) =>
        request<{ characters: Character[]; groups: CharacterGroup[] }>(
            `/characters${archived ? '?archived=true' : ''}`,
        ),
    character: (characterId: string) => request<Character>(`/characters/${characterId}`),
    createCharacter: (input: CharacterCreate) =>
        request<Character>('/characters', { method: 'POST', body: JSON.stringify(input) }),
    updateCharacter: (characterId: string, input: CharacterUpdate) =>
        request<Character>(`/characters/${characterId}`, {
            method: 'PATCH',
            body: JSON.stringify(input),
        }),
    archiveCharacter: (characterId: string) =>
        request<void>(`/characters/${characterId}`, { method: 'DELETE' }),
    deleteCharacter: (characterId: string) =>
        request<void>(`/characters/${characterId}/permanent`, { method: 'DELETE' }),
    restoreCharacter: (characterId: string) =>
        request<Character>(`/characters/${characterId}/restore`, { method: 'POST' }),
    characterAssets: (characterId: string) =>
        request<{ assets: CharacterAsset[] }>(`/characters/${characterId}/assets`),
    uploadAvatar: async (characterId: string, file: File) => {
        const form = new FormData()
        form.set('file', file)
        return request<Character>(`/characters/${characterId}/avatar`, {
            method: 'PUT',
            body: form,
        })
    },
    removeAvatar: (characterId: string) =>
        request<Character>(`/characters/${characterId}/avatar`, { method: 'DELETE' }),
    triggerLua: (conversationId: string, input: LuaTriggerRequest) =>
        request<{ messages: Message[]; displayEpoch: number; warnings: string[] }>(
            `/conversations/${conversationId}/lua/trigger`,
            { method: 'POST', body: JSON.stringify(input) },
        ),
    resolveRuntimeCommand: (
        commandId: string,
        input: { clientInstanceId: string; result: unknown; error?: string },
    ) =>
        request<{ ok: true }>(`/runtime/commands/${commandId}/result`, {
            method: 'POST',
            body: JSON.stringify(input),
        }),
    createCharacterGroup: (name: string) =>
        request<CharacterGroup>('/characters/groups', {
            method: 'POST',
            body: JSON.stringify({ name }),
        }),
    updateCharacterGroup: (groupId: string, name: string) =>
        request<CharacterGroup>(`/characters/groups/${groupId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name }),
        }),
    deleteCharacterGroup: (groupId: string) =>
        request<void>(`/characters/groups/${groupId}`, { method: 'DELETE' }),
    organizeCharacters: (input: CharacterOrganization) =>
        request<{ characters: Character[]; groups: CharacterGroup[] }>('/characters/organization', {
            method: 'PUT',
            body: JSON.stringify(input),
        }),
    personas: () => request<{ personas: Persona[] }>('/personas'),
    createPersona: (input: PersonaCreate) =>
        request<Persona>('/personas', { method: 'POST', body: JSON.stringify(input) }),
    updatePersona: (personaId: string, input: PersonaUpdate) =>
        request<Persona>(`/personas/${personaId}`, {
            method: 'PATCH',
            body: JSON.stringify(input),
        }),
    deletePersona: (personaId: string) =>
        request<void>(`/personas/${personaId}`, { method: 'DELETE' }),
    uploadPersonaAvatar: async (personaId: string, file: File) => {
        const form = new FormData()
        form.set('file', file)
        return request<Persona>(`/personas/${personaId}/avatar`, { method: 'PUT', body: form })
    },
    removePersonaAvatar: (personaId: string) =>
        request<Persona>(`/personas/${personaId}/avatar`, { method: 'DELETE' }),
    conversations: (archived = false) =>
        request<{ conversations: Conversation[]; groups: ConversationGroup[] }>(
            `/conversations${archived ? '?archived=true' : ''}`,
        ),
    messages: (conversationId: string) =>
        request<{ messages: Message[] }>(`/conversations/${conversationId}/messages`),
    createConversation: (
        characterId: string,
        input: {
            title?: string
            promptPresetId?: string
            modelPresetId?: string | null
            auxiliaryModelPresetId?: string | null
            modelChainPresetId?: string | null
            greetingIndex?: number
        } = {},
    ) =>
        request<Conversation>('/conversations', {
            method: 'POST',
            body: JSON.stringify({ characterId, greetingIndex: -1, ...input }),
        }),
    updateConversation: (
        conversationId: string,
        input: Partial<
            Pick<
                Conversation,
                | 'title'
                | 'promptPresetId'
                | 'promptPresetLocked'
                | 'variables'
                | 'authorNote'
                | 'boundPersonaId'
                | 'personaLocked'
                | 'greetingIndex'
                | 'modelPresetId'
                | 'auxiliaryModelPresetId'
                | 'modelChainPresetId'
            >
        >,
    ) =>
        request<Conversation>(`/conversations/${conversationId}`, {
            method: 'PATCH',
            body: JSON.stringify(input),
        }),
    archiveConversation: (conversationId: string) =>
        request<void>(`/conversations/${conversationId}`, { method: 'DELETE' }),
    deleteConversation: (conversationId: string) =>
        request<void>(`/conversations/${conversationId}/permanent`, { method: 'DELETE' }),
    restoreConversation: (conversationId: string) =>
        request<Conversation>(`/conversations/${conversationId}/restore`, { method: 'POST' }),
    createConversationGroup: (characterId: string, name: string) =>
        request<ConversationGroup>('/conversations/groups', {
            method: 'POST',
            body: JSON.stringify({ characterId, name }),
        }),
    updateConversationGroup: (groupId: string, name: string) =>
        request<ConversationGroup>(`/conversations/groups/${groupId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name }),
        }),
    deleteConversationGroup: (groupId: string) =>
        request<void>(`/conversations/groups/${groupId}`, { method: 'DELETE' }),
    organizeConversations: (input: ConversationOrganization) =>
        request<{ conversations: Conversation[]; groups: ConversationGroup[] }>(
            '/conversations/organization',
            { method: 'PUT', body: JSON.stringify(input) },
        ),
    activeGeneration: (conversationId: string) =>
        request<{ generation: GenerationRun | null }>(
            `/conversations/${conversationId}/generation`,
        ),
    updateMessage: (conversationId: string, messageId: string, content: string) =>
        request<Message>(`/conversations/${conversationId}/messages/${messageId}`, {
            method: 'PATCH',
            body: JSON.stringify({ content }),
        }),
    deleteMessage: (conversationId: string, messageId: string) =>
        request<void>(`/conversations/${conversationId}/messages/${messageId}`, {
            method: 'DELETE',
        }),
    truncateFromMessage: (conversationId: string, messageId: string) =>
        request<{ deleted: number }>(
            `/conversations/${conversationId}/messages/${messageId}/from`,
            { method: 'DELETE' },
        ),
    truncateAfterMessage: (conversationId: string, messageId: string) =>
        request<{ deleted: number }>(
            `/conversations/${conversationId}/messages/${messageId}/after`,
            { method: 'DELETE' },
        ),
    messageGenerations: (conversationId: string, messageId: string) =>
        request<{ generations: GenerationRun[] }>(
            `/conversations/${conversationId}/messages/${messageId}/generations`,
        ),
    selectGeneration: (conversationId: string, messageId: string, generationId: string) =>
        request<Message>(`/conversations/${conversationId}/messages/${messageId}/generation`, {
            method: 'PUT',
            body: JSON.stringify({ generationId }),
        }),
    promptPreview: (conversationId: string) =>
        request<PromptPreview>(`/conversations/${conversationId}/prompt-preview`, {
            method: 'POST',
        }),
    longTermMemory: (conversationId: string) =>
        request<LongTermMemoryState>(`/conversations/${conversationId}/memory`),
    updateLongTermMemory: (conversationId: string, input: Partial<LongTermMemorySettings>) =>
        request<LongTermMemoryState>(`/conversations/${conversationId}/memory`, {
            method: 'PATCH',
            body: JSON.stringify(input),
        }),
    clearLongTermMemory: (conversationId: string) =>
        request<{ deleted: number }>(`/conversations/${conversationId}/memory`, {
            method: 'DELETE',
        }),
    updateLongTermMemorySummary: (
        conversationId: string,
        summaryId: string,
        input: Partial<Pick<LongTermMemorySummary, 'text' | 'isImportant'>>,
    ) =>
        request<LongTermMemorySummary>(
            `/conversations/${conversationId}/memory/summaries/${summaryId}`,
            { method: 'PATCH', body: JSON.stringify(input) },
        ),
    deleteLongTermMemorySummary: (conversationId: string, summaryId: string) =>
        request<void>(`/conversations/${conversationId}/memory/summaries/${summaryId}`, {
            method: 'DELETE',
        }),
    importCharacter: async (file: File) => {
        const form = new FormData()
        form.set('file', file)
        return request<{ character: Character; warnings: string[] }>('/characters/import', {
            method: 'POST',
            body: form,
        })
    },
    settings: () => request<AppSettings>('/settings'),
    backupConfig: () => request<{ allowed: boolean }>('/settings/backup'),
    backupSnapshots: () => request<{ snapshots: BackupSnapshot[] }>('/settings/backups'),
    createBackupSnapshot: () => request<BackupSnapshot>('/settings/backups', { method: 'POST' }),
    restoreBackupSnapshot: (id: string) =>
        request<{ restored: BackupSnapshot; safetySnapshot: BackupSnapshot }>(
            `/settings/backups/${encodeURIComponent(id)}/restore`,
            { method: 'POST' },
        ),
    deleteBackupSnapshot: (id: string) =>
        request<void>(`/settings/backups/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    downloadBackupSnapshot: (id: string) =>
        requestBlob(`/settings/backups/${encodeURIComponent(id)}/download`),
    updateSettings: (input: Partial<AppSettings>) =>
        request<AppSettings>('/settings', { method: 'PATCH', body: JSON.stringify(input) }),
    requestDebugHistory: () => request<{ requests: RequestDebugRecord[] }>('/debug/requests'),
    clearRequestDebugHistory: () =>
        request<{ deleted: number }>('/debug/requests', { method: 'DELETE' }),
    systemLogs: () => request<{ logs: SystemLogEntry[] }>('/debug/system-logs'),
    clearSystemLogs: () => request<{ deleted: number }>('/debug/system-logs', { method: 'DELETE' }),
    providerRequestLogs: () => request<{ requests: ProviderRequestLog[] }>('/debug/request-logs'),
    providerRequestLog: (id: string) =>
        request<ProviderRequestLogDetail>(`/debug/request-logs/${encodeURIComponent(id)}`),
    clearProviderRequestLogs: () =>
        request<{ deletedDetails: number; cutoff: number }>('/debug/request-logs', {
            method: 'DELETE',
        }),
    usageStatistics: () => request<UsageStatistics>('/debug/request-logs/usage'),
    provider: () => request<ProviderSettings | null>('/provider'),
    updateProvider: (input: ProviderSettingsInput) =>
        request<ProviderSettings>('/provider', { method: 'PUT', body: JSON.stringify(input) }),
    testProvider: () =>
        request<{ ok: boolean; message: string }>('/provider/test', { method: 'POST' }),
    modelCatalog: () =>
        request<{ presets: ModelPreset[]; apiKeys: ModelApiKey[] }>('/model-presets'),
    createModelPreset: (input: ModelPresetInput) =>
        request<ModelPreset>('/model-presets', {
            method: 'POST',
            body: JSON.stringify(input),
        }),
    updateModelPreset: (id: string, input: ModelPresetInput) =>
        request<ModelPreset>(`/model-presets/${id}`, {
            method: 'PUT',
            body: JSON.stringify(input),
        }),
    deleteModelPreset: (id: string) => request<void>(`/model-presets/${id}`, { method: 'DELETE' }),
    testModelPreset: (id: string) =>
        request<{ ok: boolean; message: string }>(`/model-presets/${id}/test`, {
            method: 'POST',
        }),
    discoverModels: (input: ModelDiscoveryInput) =>
        request<{ models: Array<{ id: string; name: string }> }>('/model-presets/models', {
            method: 'POST',
            body: JSON.stringify(input),
        }),
    importModelPreset: (file: File) => uploadFile<ModelPreset>('/model-presets/import', file),
    createModelApiKey: (input: ModelApiKeyInput) =>
        request<ModelApiKey>('/model-presets/api-keys', {
            method: 'POST',
            body: JSON.stringify(input),
        }),
    updateModelApiKey: (id: string, input: ModelApiKeyInput) =>
        request<ModelApiKey>(`/model-presets/api-keys/${id}`, {
            method: 'PUT',
            body: JSON.stringify(input),
        }),
    deleteModelApiKey: (id: string) =>
        request<void>(`/model-presets/api-keys/${id}`, { method: 'DELETE' }),
    modelChains: () => request<{ presets: ModelChainPreset[] }>('/model-chains'),
    createModelChain: (input: ModelChainPresetInput) =>
        request<ModelChainPreset>('/model-chains', {
            method: 'POST',
            body: JSON.stringify(input),
        }),
    updateModelChain: (id: string, input: ModelChainPresetInput) =>
        request<ModelChainPreset>(`/model-chains/${id}`, {
            method: 'PUT',
            body: JSON.stringify(input),
        }),
    deleteModelChain: (id: string) => request<void>(`/model-chains/${id}`, { method: 'DELETE' }),
    promptPresets: () => request<{ promptPresets: PromptPreset[] }>('/prompt-presets'),
    createPromptPreset: (input: PromptPresetInput) =>
        request<PromptPreset>('/prompt-presets', {
            method: 'POST',
            body: JSON.stringify(input),
        }),
    updatePromptPreset: (presetId: string, input: PromptPresetInput) =>
        request<PromptPreset>(`/prompt-presets/${presetId}`, {
            method: 'PUT',
            body: JSON.stringify(input),
        }),
    deletePromptPreset: (presetId: string) =>
        request<void>(`/prompt-presets/${presetId}`, { method: 'DELETE' }),
    importPromptPreset: (file: File) => uploadFile<PromptPreset>('/prompt-presets/import', file),
    importPromptRegex: (presetId: string, file: File, mode: 'append' | 'replace' = 'append') =>
        uploadFile<PromptPreset>(`/prompt-presets/${presetId}/regex/import?mode=${mode}`, file),
    promptModules: () => request<{ modules: PromptModule[] }>('/prompt-modules'),
    createPromptModule: (input: PromptModuleInput) =>
        request<PromptModule>('/prompt-modules', {
            method: 'POST',
            body: JSON.stringify(input),
        }),
    updatePromptModule: (moduleId: string, input: PromptModuleInput) =>
        request<PromptModule>(`/prompt-modules/${moduleId}`, {
            method: 'PUT',
            body: JSON.stringify(input),
        }),
    deletePromptModule: (moduleId: string) =>
        request<void>(`/prompt-modules/${moduleId}`, { method: 'DELETE' }),
    importPromptModule: (file: File) => uploadFile<PromptModule>('/prompt-modules/import', file),
    conversationModules: (conversationId: string) =>
        request<{ modules: ConversationModuleState[] }>(`/conversations/${conversationId}/modules`),
    updateConversationModule: (conversationId: string, moduleId: string, enabled: boolean | null) =>
        request<{ modules: ConversationModuleState[] }>(
            `/conversations/${conversationId}/modules/${moduleId}`,
            { method: 'PUT', body: JSON.stringify({ enabled }) },
        ),
    cancelGeneration: (generationId: string) =>
        request<void>(`/generations/${generationId}`, { method: 'DELETE' }),
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
    const form = new FormData()
    form.set('file', file)
    return request<T>(path, { method: 'POST', body: form })
}

export function assetUrl(assetId: string): string {
    return `${API_BASE}/assets/${assetId}`
}

export function characterExportUrl(
    characterId: string,
    spec: 'v2' | 'v3',
    format: 'json' | 'png' | 'charx',
): string {
    return `${API_BASE}/characters/${characterId}/export?spec=${spec}&format=${format}`
}

export const CHARACTER_EXPORT_FORMATS: ReadonlyArray<{
    spec: 'v2' | 'v3'
    format: 'json' | 'png' | 'charx'
    label: string
}> = [
    { spec: 'v3', format: 'charx', label: 'CCv3 · CHARX' },
    { spec: 'v3', format: 'png', label: 'CCv3 · PNG' },
    { spec: 'v3', format: 'json', label: 'CCv3 · JSON' },
    { spec: 'v2', format: 'png', label: 'CCv2 · PNG' },
    { spec: 'v2', format: 'json', label: 'CCv2 · JSON' },
]

export function promptPresetExportUrl(
    presetId: string,
    format: 'json' | 'risupreset' | 'risup',
): string {
    return `${API_BASE}/prompt-presets/${presetId}/export?format=${format}`
}

export function modelPresetExportUrl(presetId: string): string {
    return `${API_BASE}/model-presets/${presetId}/export`
}

export function promptRegexExportUrl(presetId: string): string {
    return `${API_BASE}/prompt-presets/${presetId}/regex/export`
}

export function promptModuleExportUrl(
    moduleId: string,
    format: 'json' | 'risum' | 'charx',
): string {
    return `${API_BASE}/prompt-modules/${moduleId}/export?format=${format}`
}

export async function streamGeneration(
    conversationId: string,
    input: GenerationRequest,
    onEvent: (event: GenerationEvent) => void,
): Promise<string> {
    let lastError: unknown
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
            return await streamGenerationOnce(conversationId, input, onEvent)
        } catch (error) {
            if (error instanceof ApiClientError || attempt === 3) throw error
            lastError = error
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
        }
    }
    throw lastError
}

async function streamGenerationOnce(
    conversationId: string,
    input: GenerationRequest,
    onEvent: (event: GenerationEvent) => void,
): Promise<string> {
    const response = await fetch(`${API_BASE}/conversations/${conversationId}/generations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw await responseError(response)
    if (!response.body) throw new ApiClientError('Streaming response is unavailable', 502)

    const generationId = response.headers.get('x-generation-id') || ''
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''

        for (const block of blocks) {
            const data = block
                .split('\n')
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trimStart())
                .join('\n')
            if (data) onEvent(JSON.parse(data) as GenerationEvent)
        }
        if (done) break
    }

    return generationId
}
