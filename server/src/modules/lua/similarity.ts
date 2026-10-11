import { createHash } from 'node:crypto'

const MODEL = 'Xenova/all-MiniLM-L6-v2'

export class MiniLmSimilarity {
    private extractor: Promise<any> | undefined
    private readonly vectors = new Map<string, Float32Array>()

    async rank(query: string, values: string[]): Promise<string[]> {
        const queryVector = await this.embed(query)
        const scored = await Promise.all(
            values.map(async (value, index) => ({
                value,
                index,
                score: dot(queryVector, await this.embed(value)),
            })),
        )
        return scored
            .sort((left, right) => right.score - left.score || left.index - right.index)
            .map((item) => item.value)
    }

    private async embed(text: string): Promise<Float32Array> {
        const key = createHash('sha256').update(`${MODEL}\0${text}`).digest('hex')
        const cached = this.vectors.get(key)
        if (cached) return cached
        this.extractor ??= import('@xenova/transformers').then(({ pipeline }) =>
            pipeline('feature-extraction', MODEL, { quantized: true }),
        )
        const extractor = await this.extractor
        const output = await extractor(text, { pooling: 'mean', normalize: true })
        const vector = Float32Array.from(output.data as ArrayLike<number>)
        this.vectors.set(key, vector)
        if (this.vectors.size > 10_000) this.vectors.delete(this.vectors.keys().next().value!)
        return vector
    }
}

function dot(left: Float32Array, right: Float32Array) {
    let result = 0
    const length = Math.min(left.length, right.length)
    for (let index = 0; index < length; index += 1) result += left[index]! * right[index]!
    return result
}
