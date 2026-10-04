# PocketRisu message rendering parity

Differential tests that compare Malang's chat message HTML with the HTML that
PocketRisu itself produces for the same input. The expected output is never
hand-written: it comes from PocketRisu's real parser, run by the oracle in
`scripts/pocketrisu-oracle/`.

## What is compared

| Side       | Pipeline                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PocketRisu | `risuChatParser` (visualize) → `ParseMarkdown(…, 'notrim')` (assets, editdisplay regex, inlays, `<Thoughts>`, style encoding, markdown-it + highlight.js + KaTeX) → `trimMarkdown` → `addMetadataToElement`, the same sequence as `Chats.svelte` → `Chat.svelte` → `ChatBody.svelte` |
| Malang     | `renderDisplayText` (editdisplay regex → CBS, as the server display batch uses) → `renderMessageContentHtml` (as `MessageContent` uses), including the raw-text fallback                                                                                                             |

Two kinds of cases live in `cases.ts`:

- `markup/*`: text that has already passed CBS and regex, rendered without a character.
- `message/*`: a stored chat message with user/char names, variables and editdisplay
  regex, rendered through the whole pipeline.

Both outputs are parsed into a DOM and compared after sorting attributes. Text,
whitespace, tags and attribute values must match exactly. Lua `editDisplay`
triggers, stored assets and translation are outside the scenarios.

## Commands (run in `web/`)

```bash
bun test test/pocketrisu-parity          # golden comparison, known deviations as test.failing
bun run test:parity                      # strict: every difference fails
bun run test:parity:live                 # live oracle: golden freshness + seeded fuzzing
bun run pocketrisu:golden                # regenerate pocketrisu-golden.json
```

Live runs and regeneration need a PocketRisu checkout with its dependencies installed
(`extra/PocketRisu` by default, or `POCKETRISU_ROOT`). Fuzzing accepts
`PARITY_FUZZ_SEED` and `PARITY_FUZZ_COUNT`, and writes the mismatches to
`fuzz-report.local.json` (git-ignored).

## Workflow

- **Adding a case:** add it to `cases.ts`, then run `bun run pocketrisu:golden`.
  Each golden entry stores a hash of its input, so a stale golden file fails the suite.
- **Fixing a difference:** its `test.failing` test starts failing. Remove the
  entry from `known-deviations.ts`.
- **Upgrading PocketRisu:** `bun run test:parity:live` reports the cases whose output
  changed; regenerate the golden file and review the diff.

## Oracle notes

- The oracle runs inside PocketRisu's own Vitest toolchain (its Vite, Svelte plugin
  and dependency versions). Only `stores.svelte.ts` and `globalApi.svelte.ts` are
  stubbed; database defaults come from PocketRisu's real `setDatabase()`.
- Both sides render in the same happy-dom (Malang's version, through
  `happy-dom-environment.mjs`). PocketRisu's pinned happy-dom mis-nests unclosed tags
  and skips named character references, which showed up as false differences.
  `test/happy-dom-node-name.ts` corrects a happy-dom quirk that made DOMPurify 3.4
  drop every element. MathML (KaTeX) output can still differ from Chrome.
- Inlay placeholders are compared as PocketRisu emits them. Swapping them for media
  happens after render (`resolveInlayPlaceholders`) and is covered by unit tests,
  since the oracle has no inlay storage.
