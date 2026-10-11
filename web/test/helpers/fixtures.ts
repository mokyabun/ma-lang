import type {
    AppSettings,
    Character,
    CharacterAsset,
    Conversation,
    GenerationRun,
    LoreEntry,
    Message,
    Persona,
} from '@malang/shared'

const TIMESTAMP = '2026-01-01T00:00:00.000Z'

/** A valid UUID that shows `n` at the end, so failures name the entity. */
export function testId(n: number): string {
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

export function makeCharacter(overrides: Partial<Character> = {}): Character {
    return {
        id: testId(10),
        name: 'Aria',
        description: '',
        personality: '',
        scenario: '',
        firstMessage: '',
        alternateGreetings: [],
        exampleMessage: '',
        systemPrompt: '',
        postHistoryInstructions: '',
        creator: '',
        characterVersion: '',
        tags: [],
        avatarAssetId: null,
        sourceSpec: 'v3',
        archivedAt: null,
        groupId: null,
        sortOrder: 0,
        regexScripts: [],
        moduleReferences: [],
        defaultVariables: {},
        bias: [],
        luaScript: null,
        luaRawTriggers: [],
        loreSettings: {},
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
        ...overrides,
    }
}

export function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
    return {
        id: testId(100),
        characterId: testId(10),
        promptPresetId: testId(900),
        promptPresetLocked: false,
        modelPresetId: null,
        auxiliaryModelPresetId: null,
        modelChainPresetId: null,
        title: 'Library chat',
        greetingIndex: -1,
        variables: {},
        authorNote: '',
        boundPersonaId: null,
        personaLocked: false,
        archivedAt: null,
        groupId: null,
        sortOrder: 0,
        displayEpoch: 0,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
        ...overrides,
    }
}

export function makeMessage(overrides: Partial<Message> = {}): Message {
    return {
        id: testId(200),
        conversationId: testId(100),
        role: 'user',
        content: '',
        position: 0,
        status: 'complete',
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
        ...overrides,
    }
}

export function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
    return {
        userName: 'User',
        globalVariables: {},
        promptToggleValues: {},
        defaultPromptPresetId: null,
        defaultModelPresetId: null,
        defaultAuxiliaryModelPresetId: null,
        selectedPersonaId: null,
        requestDebugEnabled: false,
        autoBackupEnabled: true,
        jailbreakToggle: false,
        chainOfThought: false,
        ...overrides,
    }
}

export function makePersona(overrides: Partial<Persona> = {}): Persona {
    return {
        id: testId(300),
        name: '민준',
        description: '',
        note: '',
        avatarAssetId: null,
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
        ...overrides,
    }
}

export function makeAsset(overrides: Partial<CharacterAsset> = {}): CharacterAsset {
    return {
        assetId: testId(400),
        type: 'other',
        name: 'moon',
        extension: 'webp',
        sourceUri: 'embeded://moon.webp',
        mimeType: 'image/webp',
        size: 4,
        ...overrides,
    }
}

export function makeGenerationRun(overrides: Partial<GenerationRun> = {}): GenerationRun {
    return {
        id: testId(500),
        conversationId: testId(100),
        messageId: null,
        status: 'running',
        provider: 'echo',
        modelId: 'echo',
        parameters: {},
        outputText: '',
        processedOutputText: '',
        inputTokens: null,
        outputTokens: null,
        errorCode: null,
        errorMessage: null,
        startedAt: TIMESTAMP,
        completedAt: null,
        ...overrides,
    }
}

export function makeLoreEntry(overrides: Partial<LoreEntry> = {}): LoreEntry {
    return {
        id: testId(600),
        keys: [],
        secondaryKeys: [],
        content: '',
        enabled: true,
        constant: false,
        selective: false,
        caseSensitive: false,
        useRegex: false,
        insertionOrder: 0,
        priority: 0,
        name: '',
        position: '',
        depth: 0,
        role: 'system',
        recursive: 'global',
        probability: 100,
        additionalKeys: [],
        excludeKeys: [],
        decorators: {},
        isGroup: false,
        ...overrides,
    }
}
