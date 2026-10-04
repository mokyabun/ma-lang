import { join } from 'node:path'

import type { AppConfig } from '../src/config'

export function appConfig(
    dataDir = '/tmp/malang-test',
    overrides: Partial<AppConfig> = {},
): AppConfig {
    return {
        nodeEnv: 'test',
        autoBackupEnabled: false,
        host: '127.0.0.1',
        dataDir,
        databasePath: join(dataDir, 'data.sqlite'),
        adminPassword: 'correct horse battery staple',
        sessionSecret: 'test-session-secret-with-enough-entropy',
        allowedOrigins: new Set(),
        cookieSecure: false,
        port: 3000,
        logLevel: 'silent',
        logPretty: false,
        logColorize: false,
        limits: {
            importBytes: 128 << 20,
            jsonBytes: 8 << 20,
            assetBytes: 32 << 20,
            archiveEntries: 4096,
            uploadChunkBytes: 64 << 10,
        },
        ...overrides,
    }
}

export function v3Card(overrides: Record<string, unknown> = {}) {
    return {
        spec: 'chara_card_v3',
        spec_version: '3.0',
        data: {
            name: 'Aria',
            description: 'An archivist.',
            personality: 'Curious',
            scenario: 'A quiet library',
            first_mes: 'Welcome, {{user}}.',
            mes_example: '',
            creator_notes: '',
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: ['You came back.'],
            group_only_greetings: [],
            tags: ['test'],
            creator: 'Malang',
            character_version: '1.0',
            extensions: { malang_test: true },
            character_book: {
                name: 'Library',
                description: '',
                scan_depth: 5,
                token_budget: 500,
                recursive_scanning: true,
                extensions: {},
                entries: [
                    {
                        keys: ['moon'],
                        secondary_keys: [],
                        content: 'The moon archive is restricted.',
                        enabled: true,
                        insertion_order: 0,
                        case_sensitive: false,
                        use_regex: false,
                        constant: false,
                        selective: false,
                        priority: 10,
                        name: 'Moon archive',
                        comment: '',
                        extensions: {},
                    },
                ],
            },
            ...overrides,
        },
    }
}
