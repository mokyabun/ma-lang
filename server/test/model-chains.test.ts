import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    chainAgentNodeId,
    CHAIN_MAIN_NODE_ID,
    ModelChainPresetInputSchema,
    GENERAL_CHAT_CHARACTER_ID,
    type ModelChainAgent,
} from '@malang/shared'

import { type AppContext, createContext } from '../src/services'
import { appConfig } from './fixtures'

describe('server-side model chains', () => {
    const directory = mkdtempSync(join(tmpdir(), 'malang-model-chains-'))
    const config = appConfig(directory)
    let context: AppContext

    beforeAll(async () => {
        context = await createContext(config)
    })

    afterAll(() => {
        context.close()
        rmSync(directory, { recursive: true, force: true })
    })

    function createEcho(name: string, message: string, delayMs = 0) {
        return context.store.modelPreset.create({
            name,
            apiKeyId: null,
            config: {
                provider: 'echo',
                modelId: name.toLocaleLowerCase().replaceAll(' ', '-'),
                defaults: {},
                providerOptions: { message, delayMs },
            },
        })
    }

    test('keeps single-model generation as the default and runs selected chains on the server', async () => {
        const main = createEcho('Main', 'MAIN BODY')
        const analyst = createEcho('Analyst', 'PRE NOTE')
        const editor = createEcho('Editor', 'POST BODY')

        const single = context.conversations.create({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: main.id,
            greetingIndex: -1,
        })
        expect(single.modelChainPresetId).toBeNull()
        await runGeneration(context, single.id, 'single request')
        expect(context.store.message.lastAssistant(single.id)?.content).toBe('MAIN BODY')

        const chain = context.store.modelChain.create({
            name: 'Review chain',
            description: 'Pre and post',
            layers: [
                {
                    id: crypto.randomUUID(),
                    name: 'Analysis',
                    phase: 'pre',
                    agents: [chainAgent('Analyze', analyst.id)],
                },
                {
                    id: crypto.randomUUID(),
                    name: 'Polish',
                    phase: 'post',
                    agents: [chainAgent('Edit', editor.id)],
                },
            ],
        })
        const chained = context.conversations.create({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: main.id,
            modelChainPresetId: chain.id,
            greetingIndex: -1,
        })
        context.store.requestDebug.clear()
        context.store.settings.update({ requestDebugEnabled: true })
        await runGeneration(context, chained.id, 'chained request')
        context.store.settings.update({ requestDebugEnabled: false })
        const message = context.store.message.lastAssistant(chained.id)
        expect(message?.content).toBe('POST BODY')
        expect(context.store.generation.listByMessage(message!.id)[0]).toMatchObject({
            outputText: 'POST BODY',
            processedOutputText: 'POST BODY',
        })
        expect(context.store.modelChain.delete(chain.id)).toBe('in_use')
        expect(context.store.modelPreset.delete(analyst.id)).toBe('in_use')

        const debugRecords = context.store.requestDebug
            .list()
            .filter((record) => record.conversationId === chained.id)
        expect(debugRecords).toHaveLength(3)
        expect(debugRecords.find((record) => !record.request.chain)).toMatchObject({
            modelId: main.config.modelId,
        })
        expect(debugRecords.find((record) => record.request.chain?.phase === 'pre')).toMatchObject({
            modelId: analyst.config.modelId,
            request: {
                chain: {
                    presetId: chain.id,
                    presetName: 'Review chain',
                    phase: 'pre',
                    layerName: 'Analysis',
                    agentName: 'Analyze',
                },
            },
        })
        expect(debugRecords.find((record) => record.request.chain?.phase === 'post')).toMatchObject(
            {
                modelId: editor.config.modelId,
                request: {
                    chain: {
                        phase: 'post',
                        layerName: 'Polish',
                        agentName: 'Edit',
                    },
                },
            },
        )
    })

    test('runs multiple pre and post agents concurrently and applies post results in order', async () => {
        const main = createEcho('Parallel Main', 'MAIN')
        const preA = createEcho('Parallel Pre A', 'PRE A', 160)
        const preB = createEcho('Parallel Pre B', 'PRE B', 160)
        const postA = createEcho('Parallel Post A', 'POST A', 160)
        const postB = createEcho('Parallel Post B', 'POST B', 160)
        const chain = context.store.modelChain.create({
            name: 'Parallel review chain',
            description: 'Multiple concurrent agents',
            layers: [
                {
                    id: crypto.randomUUID(),
                    name: 'Parallel analysis',
                    phase: 'pre',
                    agents: [chainAgent('Pre A', preA.id), chainAgent('Pre B', preB.id)],
                },
                {
                    id: crypto.randomUUID(),
                    name: 'Parallel polish',
                    phase: 'post',
                    agents: [
                        chainAgent('Post A', postA.id, { postMode: 'append' }),
                        chainAgent('Post B', postB.id, { postMode: 'append' }),
                    ],
                },
            ],
        })
        const conversation = context.conversations.create({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: main.id,
            modelChainPresetId: chain.id,
            greetingIndex: -1,
        })

        const startedAt = performance.now()
        await runGeneration(context, conversation.id, 'parallel request')
        const elapsedMs = performance.now() - startedAt

        expect(context.store.message.lastAssistant(conversation.id)?.content).toBe(
            'MAIN\n\nPOST A\n\nPOST B',
        )
        expect(elapsedMs).toBeLessThan(520)
    })

    test('persists free graphs, runs side branches and never calls disconnected models', async () => {
        const mainModel = createEcho('GraphMain', 'MAIN')
        const makeAgent = (name: string, postMode: ModelChainAgent['postMode'] = 'replace') =>
            chainAgent(name, createEcho(name, `OUTPUT_${name}`).id, { postMode })
        const a = makeAgent('A')
        const b = makeAgent('B')
        const c = makeAgent('C')
        const d = makeAgent('D')
        const side = makeAgent('Side')
        const postA = makeAgent('PostA', 'append')
        const postB = makeAgent('PostB', 'append')
        const postC = makeAgent('PostC', 'append')
        const postJoin = makeAgent('PostJoin', 'append')
        const orphan = chainAgent(
            'Orphan',
            createEcho('Orphan', '[AGENT_NOTE]bad[/AGENT_NOTE][MEMORY_UPDATE]bad[/MEMORY_UPDATE]')
                .id,
            { memoryEnabled: true },
        )
        const detached = makeAgent('Detached')
        const agents = [postJoin, d, c, a, b, side, postA, postB, postC, orphan, detached]
        const id = chainAgentNodeId
        const main = CHAIN_MAIN_NODE_ID
        const pairs = [
            [id(a.id), id(b.id)],
            [id(a.id), id(c.id)],
            [id(b.id), id(d.id)],
            [id(c.id), id(d.id)],
            [id(d.id), main],
            [id(a.id), id(side.id)],
            [main, id(postA.id)],
            [id(postA.id), id(postB.id)],
            [id(postA.id), id(postC.id)],
            [id(postB.id), id(postJoin.id)],
            [id(postC.id), id(postJoin.id)],
            [id(orphan.id), id(detached.id)],
        ]
        const input = ModelChainPresetInputSchema.parse({
            name: 'Free graph',
            description: '',
            // Deliberately all pre and shuffled: connections control execution, not layer metadata/order.
            layers: agents.map((agent) => ({
                id: crypto.randomUUID(),
                name: agent.name,
                phase: 'pre',
                agents: [agent],
            })),
            graph: {
                edges: pairs.map(([source, target]) => ({
                    id: crypto.randomUUID(),
                    source,
                    target,
                })),
                positions: { [id(orphan.id)]: { x: -120, y: 500 }, [main]: { x: 0, y: 0 } },
            },
        })
        const chain = context.store.modelChain.create(input)
        expect(context.store.modelChain.get(chain.id)?.graph).toEqual(input.graph)
        const conversation = context.conversations.create({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: mainModel.id,
            modelChainPresetId: chain.id,
            greetingIndex: -1,
        })
        context.store.settings.update({ requestDebugEnabled: true })
        try {
            await runGeneration(context, conversation.id, 'graph request')
            const records = context.store.requestDebug
                .list()
                .filter((record) => record.conversationId === conversation.id)
            expect(records).toHaveLength(10)
            const requestFor = (agent: ModelChainAgent) =>
                JSON.stringify(
                    records.find((record) => record.request.chain?.agentId === agent.id)?.request,
                )
            expect(requestFor(b)).toContain('OUTPUT_A')
            expect(requestFor(b)).not.toContain('OUTPUT_C')
            expect(requestFor(d)).toContain('OUTPUT_B')
            expect(requestFor(d)).toContain('OUTPUT_C')
            expect(requestFor(side)).toContain('OUTPUT_A')
            expect(requestFor(postB)).toContain('MAIN\\n\\nOUTPUT_PostA')
            expect(requestFor(postB)).not.toContain('OUTPUT_PostC')
            const joinRequest = requestFor(postJoin)
            expect(joinRequest).toContain('OUTPUT_PostB')
            expect(joinRequest).toContain('OUTPUT_PostC')
            expect(joinRequest.match(/OUTPUT_PostA/g)).toHaveLength(1)
            expect(
                records.some(
                    (record) =>
                        record.request.chain?.agentId === orphan.id ||
                        record.request.chain?.agentId === detached.id,
                ),
            ).toBe(false)
            expect(context.store.modelChainMemory.get(conversation.id, orphan.id)).toBe('')
            expect(context.store.message.lastAssistant(conversation.id)?.content).toBe(
                'MAIN\n\nOUTPUT_PostA\n\nOUTPUT_PostB\n\nOUTPUT_PostC\n\nOUTPUT_PostJoin',
            )

            // Explicitly clearing every edge must survive storage and execute only main.
            const updated = context.store.modelChain.update(chain.id, {
                ...input,
                graph: { ...input.graph!, edges: [] },
            })!
            expect(updated.layers).toEqual(chain.layers)
            expect(updated.graph?.edges).toEqual([])
            expect(updated.graph?.positions).toEqual(input.graph?.positions)
            await runGeneration(context, conversation.id, 'disconnected request')
            expect(context.store.message.lastAssistant(conversation.id)?.content).toBe('MAIN')
            const after = context.store.requestDebug
                .list()
                .filter((record) => record.conversationId === conversation.id)
            expect(after).toHaveLength(11)
        } finally {
            context.store.settings.update({ requestDebugEnabled: false })
        }
    })

    test('persists tagged pre-agent memory per conversation', async () => {
        const main = createEcho('Memory Main', 'MAIN')
        const memoryModel = createEcho(
            'Memory Agent',
            '[AGENT_NOTE]remember this[/AGENT_NOTE][MEMORY_UPDATE]persistent state[/MEMORY_UPDATE]',
        )
        const agent = chainAgent('Memory keeper', memoryModel.id, {
            memoryEnabled: true,
            memoryInstruction: 'Keep durable facts.',
            memoryFormat: '- fact',
        })
        const chain = context.store.modelChain.create({
            name: 'Memory chain',
            description: 'Persistent agent memory',
            layers: [
                {
                    id: crypto.randomUUID(),
                    name: 'Memory layer',
                    phase: 'pre',
                    agents: [agent],
                },
            ],
        })
        const conversation = context.conversations.create({
            characterId: GENERAL_CHAT_CHARACTER_ID,
            modelPresetId: main.id,
            modelChainPresetId: chain.id,
            greetingIndex: -1,
        })

        await runGeneration(context, conversation.id, 'remember')

        expect(context.store.modelChainMemory.get(conversation.id, agent.id)).toBe(
            'persistent state',
        )
    })
})

function chainAgent(
    name: string,
    modelPresetId: string,
    overrides: Partial<ModelChainAgent> = {},
): ModelChainAgent {
    return {
        id: crypto.randomUUID(),
        name,
        modelPresetId,
        systemPrompt: '',
        instruction: '',
        enabled: true,
        postMode: 'replace',
        assistantPrefill: false,
        includeSettingInfo: true,
        includeGlobalNote: false,
        includeLongTermMemory: true,
        includeRecentChat: true,
        includeCurrentUserInput: true,
        includePreviousNotes: true,
        memoryEnabled: false,
        memoryInstruction: '',
        memoryFormat: '',
        ...overrides,
    }
}

async function runGeneration(context: AppContext, conversationId: string, content: string) {
    const result = await context.generations.start(
        conversationId,
        {
            mode: 'reply',
            content,
            idempotencyKey: crypto.randomUUID(),
            clientInstanceId: crypto.randomUUID(),
        },
        crypto.randomUUID(),
    )
    await new Response(result.stream).text()
}
