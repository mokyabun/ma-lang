import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

import { bundledFilePath } from '@/utils'

import claudeVocab from '../../../assets/tokenizers/claude.json.gz' with { type: 'file' }
import cohereVocab from '../../../assets/tokenizers/cohere.json.gz' with { type: 'file' }
import deepseekV4Vocab from '../../../assets/tokenizers/deepseek-v4.json.gz' with { type: 'file' }
import deepseekVocab from '../../../assets/tokenizers/deepseek.json.gz' with { type: 'file' }
import glm4Vocab from '../../../assets/tokenizers/glm4.json.gz' with { type: 'file' }
import glm5Vocab from '../../../assets/tokenizers/glm5.json.gz' with { type: 'file' }
import llamaVocab from '../../../assets/tokenizers/llama.model.gz' with { type: 'file' }
import llama3Vocab from '../../../assets/tokenizers/llama3.json.gz' with { type: 'file' }
import mistralVocab from '../../../assets/tokenizers/mistral.model.gz' with { type: 'file' }
import novelaiVocab from '../../../assets/tokenizers/novelai.model.gz' with { type: 'file' }
import novellistVocab from '../../../assets/tokenizers/novellist.model.gz' with { type: 'file' }

export interface TokenEncoder {
    encode(text: string): ArrayLike<number>
}

const webTokenizerVocabs = {
    claude: { path: claudeVocab, format: 'json' },
    cohere: { path: cohereVocab, format: 'json' },
    deepseek: { path: deepseekVocab, format: 'json' },
    'deepseek-v4': { path: deepseekV4Vocab, format: 'json' },
    glm4: { path: glm4Vocab, format: 'json' },
    glm5: { path: glm5Vocab, format: 'json' },
    llama3: { path: llama3Vocab, format: 'json' },
    llama: { path: llamaVocab, format: 'sentencepiece' },
    mistral: { path: mistralVocab, format: 'sentencepiece' },
    novelai: { path: novelaiVocab, format: 'sentencepiece' },
    novellist: { path: novellistVocab, format: 'sentencepiece' },
} as const

export type EncoderName = 'cl100k_base' | 'o200k_base' | keyof typeof webTokenizerVocabs

const loaded = new Map<EncoderName, Promise<TokenEncoder>>()

export function loadEncoder(name: EncoderName): Promise<TokenEncoder> {
    let pending = loaded.get(name)
    if (!pending) {
        pending =
            name === 'cl100k_base' || name === 'o200k_base'
                ? loadTiktoken(name)
                : loadWebTokenizer(webTokenizerVocabs[name])
        loaded.set(name, pending)
        pending.catch(() => loaded.delete(name))
    }
    return pending
}

async function loadTiktoken(name: 'cl100k_base' | 'o200k_base'): Promise<TokenEncoder> {
    const { Tiktoken } = await import('@dqbd/tiktoken')
    const { default: ranks } =
        name === 'o200k_base'
            ? await import('@dqbd/tiktoken/encoders/o200k_base.json')
            : await import('@dqbd/tiktoken/encoders/cl100k_base.json')
    const tiktoken = new Tiktoken(ranks.bpe_ranks, ranks.special_tokens, ranks.pat_str)
    // Risu's tiktoken call throws on special-token text such as `<|endoftext|>`; count it as text.
    return { encode: (text) => tiktoken.encode(text, [], []) }
}

async function loadWebTokenizer(vocab: {
    path: string
    format: 'json' | 'sentencepiece'
}): Promise<TokenEncoder> {
    const { Tokenizer } = await import('@mlc-ai/web-tokenizers')
    const bytes = gunzipSync(await readFile(bundledFilePath(vocab.path)))
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    return vocab.format === 'json'
        ? await Tokenizer.fromJSON(buffer)
        : await Tokenizer.fromSentencePiece(buffer)
}
