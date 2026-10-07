import { expect, test } from 'bun:test'

import { OllamaAdapter } from '@/services/providers/ollama'
import { VertexAdapter } from '@/services/providers/vertex'

const vertexSmoke = Bun.env.VERTEX_SMOKE_PROJECT && Bun.env.VERTEX_SMOKE_MODEL ? test : test.skip
vertexSmoke('Vertex ADC smoke test', async () => {
    const result = await new VertexAdapter().healthCheck({
        provider: 'vertex',
        projectId: Bun.env.VERTEX_SMOKE_PROJECT!,
        location: Bun.env.VERTEX_SMOKE_LOCATION || 'global',
        modelId: Bun.env.VERTEX_SMOKE_MODEL!,
        defaults: {},
    })
    expect(result.ok).toBeTrue()
})

const ollamaSmoke = Bun.env.OLLAMA_SMOKE_BASE_URL && Bun.env.OLLAMA_SMOKE_MODEL ? test : test.skip
ollamaSmoke('Ollama server smoke test', async () => {
    const config = {
        provider: 'ollama' as const,
        baseUrl: Bun.env.OLLAMA_SMOKE_BASE_URL!,
        modelId: Bun.env.OLLAMA_SMOKE_MODEL!,
        defaults: {},
    }
    const adapter = new OllamaAdapter()
    expect((await adapter.healthCheck(config)).ok).toBeTrue()
    expect(
        (await adapter.listModels(config)).some((model) => model.id === config.modelId),
    ).toBeTrue()
})
