import { describe, expect, test } from 'bun:test'

import type { MemorySummaryRecord } from '@/db'
import { cosineSimilarity, featureVector, selectMemorySummaries } from '@/services/memory/hypa-v3'
import { compilePrompt } from '@/services/prompt/compiler'

function summary(
    id: string,
    text: string,
    options: { important?: boolean; createdAt?: string } = {},
): MemorySummaryRecord {
    const createdAt = options.createdAt || '2026-01-01T00:00:00.000Z'
    return {
        id,
        conversationId: 'conversation',
        text,
        sourceMessageIds: [`message-${id}`],
        vector: featureVector(text),
        isImportant: options.important || false,
        createdAt,
        updatedAt: createdAt,
    }
}

describe('HypaMemory V3 local similarity', () => {
    test('Korean character n-grams rank related memories above unrelated text', async () => {
        const query = featureVector('서울 여행에서 먹은 김치찌개')
        const related = featureVector('서울 여행 중 식당에서 김치찌개를 먹었다')
        const unrelated = featureVector('우주선 엔진을 수리하고 화성으로 출발했다')

        expect(cosineSimilarity(query, related)).toBeGreaterThan(cosineSimilarity(query, unrelated))
    })

    test('selects important memory first and fills the similarity slot', async () => {
        const important = summary('important', '주인공은 반드시 여동생과의 약속을 지켜야 한다.', {
            important: true,
        })
        const related = summary('related', '서울 여행에서 남산과 한강을 함께 방문했다.')
        const unrelated = summary('unrelated', '화성 기지의 산소 발생기를 수리했다.')

        const result = selectMemorySummaries(
            [important, unrelated, related],
            '서울에서 함께 갔던 장소를 기억해?',
            40,
            { recentMemoryRatio: 0, similarMemoryRatio: 1 },
        )

        expect(result.metrics.importantSummaryIds).toEqual(['important'])
        expect(result.metrics.similarSummaryIds[0]).toBe('related')
        expect(result.summaries.map((item) => item.id)).toContain('important')
        expect(result.summaries.map((item) => item.id)).toContain('related')
    })

    test('keeps selected summaries in chronological order', async () => {
        const old = summary('old', '오래전 서울에서 만났다.')
        const recent = summary('recent', '오늘 부산으로 출발했다.')
        const result = selectMemorySummaries([old, recent], '서울에서 만난 일', 100, {
            recentMemoryRatio: 0.5,
            similarMemoryRatio: 0.5,
        })

        expect(result.summaries.map((item) => item.id)).toEqual(['old', 'recent'])
    })
})

describe('HypaMemory V3 prompt integration', () => {
    test('replaces summarized source turns with the selected memory prompt', async () => {
        const input = {
            character: {
                id: 'character',
                name: 'Aria',
                description: '',
                personality: '',
                scenario: '',
                firstMessage: '',
                exampleMessage: '',
                systemPrompt: '',
                postHistoryInstructions: '',
                lorebook: [],
                loreSettings: {},
                regexScripts: [],
            },
            conversation: { id: 'conversation', variables: {}, toggles: {}, authorNote: '' },
            messages: [
                {
                    id: 'old',
                    role: 'assistant',
                    content: 'This source turn must disappear.',
                    status: 'complete',
                    createdAt: '2026-01-01T00:00:00.000Z',
                },
                {
                    id: 'latest',
                    role: 'user',
                    content: 'What happened before?',
                    status: 'complete',
                    createdAt: '2026-01-02T00:00:00.000Z',
                },
            ],
            preset: {
                warnings: [],
                toggles: [],
                defaultVariables: {},
                parameters: {},
                regexScripts: [],
                blocks: [
                    { id: 'chat', enabled: true, type: 'chat', rangeStart: 0, rangeEnd: 'end' },
                ],
                promptSettings: {
                    sendChatAsSystem: false,
                    sendName: false,
                    assistantPrefill: '',
                },
            },
            settings: { userName: 'Mina', globalVariables: {} },
            parameters: { maxContextTokens: 8192, maxOutputTokens: 512 },
            longTermMemory: {
                enabled: true,
                content: '<Past Events Summary>\nAria found the key.\n</Past Events Summary>',
                summarizedMessageIds: ['old'],
                selectedSummaryIds: ['summary'],
                summaryCount: 1,
            },
        } as unknown as Parameters<typeof compilePrompt>[0]

        const result = await compilePrompt(input)
        const contents = result.messages.map((message) => message.content)
        expect(contents.some((content) => content.includes('Aria found the key.'))).toBe(true)
        expect(contents).not.toContain('This source turn must disappear.')
        expect(contents).toContain('What happened before?')
        expect(result.longTermMemory).toEqual({
            enabled: true,
            summaryCount: 1,
            selectedSummaryIds: ['summary'],
        })
    })
})
