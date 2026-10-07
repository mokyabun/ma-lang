# Tokenizer vocabularies

Copied from RisuAI `public/token/` at commit `ea0871de01ab068daff874c73cbbd98ccf4c4066` and
gzip-compressed (`gzip -9n`). The files PocketRisu also ships (`3d30fc5`) are byte-identical.
SHA-256 values are of the uncompressed files.

| File                  | Upstream path                | SHA-256                                                            |
| --------------------- | ---------------------------- | ------------------------------------------------------------------ |
| `claude.json.gz`      | `claude/claude.json`         | `c241737df24b4e7f7c9af4fdcee29a0ca903dcb288a8b753bc346a3092911767` |
| `cohere.json.gz`      | `cohere/tokenizer.json`      | `5e07ab012ff6144f924acb0c46e8462ade9119d6375a7712a170dc7620291493` |
| `deepseek.json.gz`    | `deepseek/tokenizer.json`    | `ecb6f9fc369894346f0511f4074ca75cee5cd5f3b06d02f1ba35fcd39f8e121d` |
| `deepseek-v4.json.gz` | `deepseek/v4/tokenizer.json` | `3ad46a8c78edf140516eb696f948ae6e7c3522ec64993b219833145e2e9951d0` |
| `glm4.json.gz`        | `glm4/tokenizer.json`        | `1dfc31b811042be1dab7f489cd8e677eb014caa3f435d9543ae4807b27cb65ce` |
| `glm5.json.gz`        | `glm5/tokenizer.json`        | `f73933d2e4b633ce5a75f049a68b339790c52b966025e895aae0a0eda67d5cda` |
| `llama3.json.gz`      | `llama/llama3.json`          | `c05a3c2174e9edd5be19dc5a0748c42a9037bec2811ce062728bfd71f8702d78` |
| `llama.model.gz`      | `llama/llama.model`          | `9e556afd44213b6bd1be2b850ebbbd98f5481437a8021afaf58ee7fb1818d347` |
| `mistral.model.gz`    | `mistral/tokenizer.model`    | `dadfd56d766715c61d2ef780a525ab43b8e6da4de6865bda3d95fdef5e134055` |
| `novelai.model.gz`    | `nai/nerdstash_v2.model`     | `005ad680b10f1abd406bdb0ca9c6a5d83fc1f6e0a855bdd1942c1ceab1fb47ab` |
| `novellist.model.gz`  | `trin/spiece.model`          | `ec31a22c0dca80dc303894ca87547154961b22e312c10c6fab751db7c4584439` |

`claude.LICENSE` and `novellist.LICENSE` are the upstream license files of those vocabularies;
`glm4.SOURCE.md` and `glm5.SOURCE.md` record where RisuAI obtained the GLM files.

The cl100k/o200k encodings come from the `@dqbd/tiktoken` package. `gemma/tokenizer.*` is not
copied: RisuAI's Gemma tokenizer loads `llama/llama3.json`.
