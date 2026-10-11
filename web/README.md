# Malang Web

The React SPA frontend for Malang. It uses Vite, TanStack Router file routes, Jotai for shared
state, and the API served by `@malang/server` with types from `@malang/shared`.

## Development

From the repository root:

```bash
bun run dev
```

The web app runs on port `5173`. It calls the API on its own origin (`/api/v1`, override with
`VITE_API_BASE_URL`); in development Vite proxies `/api` and `/health` to `http://127.0.0.1:3000`
(override with `MALANG_API_TARGET`).

## Workspace Commands

From `web/`:

```bash
bun run dev
bun run build
bun run test
bun run lint
bun run typecheck
bun run test:parity    # PocketRisu rendering parity against the golden file
```

## API calls

`src/lib/api/index.ts` is the API facade: call `api.<operation>(…)`; types come from
`@malang/shared`.

## Routing

TanStack Router generates `src/routeTree.gen.ts` from `src/routes` during Vite startup and build;
never edit it. Route files are stubs: `createFileRoute` plus a component that reads the params and
renders `AppShell` (characters and chats) or a feature page (`SettingsWorkspace`, `LoginScreen`).
Auth checks and redirects live in `beforeLoad`.

## Source layout

```
src/
  main.tsx, router.tsx, styles.css, routeTree.gen.ts
  routes/               stubs: createFileRoute + params → <AppShell page={…}/> or a feature page
  app/                  composition root: app shell, workspace layout, bootstrap and feedback
  features/
    auth/               login screen
    lorebook/           lore entry tree + entry editor (used by characters, prompt-modules)
    illustrations/      actor/state/continuity editors, illustration + style settings sections
    theme/              theme settings section
    system/             system section: backup, system + request logs, usage
    model-presets/      model preset + API key catalogs and editors
    model-chains/       model chain node editor (React Flow), see its README.md
    prompt-presets/     prompt preset workbench (server module: prompts)
    prompt-modules/     prompt module workbench
    personas/           persona state, avatar, manager, settings section
    characters/         character state, avatar, editors, delete hook
    navigation/         character rail + conversation list with group drag-and-drop
    chat/               chat workspace, transcript, composer, inspector, conversation settings
    settings/           settings shell: workspace, panel, navigation, content, section types
  components/
    ui/                 shadcn primitives
    dialogs/            confirmation/loading state + dialogs, import progress
    form/               field, settings group, segmented choice, notice box, editor shell, workbench
    prompt/             bias editor, regex row, prompt toggle editors
    theme-provider.tsx, theme-toggle.tsx, theme-preferences.ts
    page-heading.tsx, app-search-input.tsx, auto-save-status.tsx
  hooks/                generic React hooks (debounced save, scroll virtualizer, editable catalog)
  lib/
    api/                API facade
    store.ts            shared entity atoms (characters, conversations, settings, presets …)
    workspace-page.ts   WorkspacePage, CharacterEditorSection
    …                   PocketRisu rendering pipeline, prompt toggle syntax, helpers
test/                   React hook harness, happy-dom preload, pocketrisu-parity/
```

Feature names follow `server/src/modules` where the concept matches; `chat` covers the server's
`conversations` and `generations`, and `lorebook`, `navigation` and `theme` are web-only.

### Layer rules

| Layer           | May import from                                              |
| --------------- | ------------------------------------------------------------ |
| `routes/`       | `app/`, `features/*`, `components/`, `hooks/`, `lib/`        |
| `app/`          | `features/*`, `components/`, `hooks/`, `lib/`                |
| `features/<x>/` | the features listed below, `components/`, `hooks/`, `lib/`   |
| `components/`   | `components/`, `hooks/`, `lib/`: never `features/` or `app/` |
| `hooks/`        | `hooks/`, `lib/`                                             |
| `lib/`          | `lib/` only                                                  |

```
app ───────────► chat, characters, navigation, personas
settings ──────► chat, illustrations, model-chains, model-presets, personas,
                 prompt-modules, prompt-presets, system, theme
chat ──────────► characters, illustrations, navigation, personas, prompt-modules, prompt-presets
navigation ────► characters
characters ────► illustrations, lorebook, personas
personas ──────► illustrations
prompt-modules ► lorebook
auth, illustrations, lorebook, model-chains, model-presets, prompt-presets, system, theme ► (none)
```

Code used by one feature lives in that feature. Code used by several features moves down to
`components/`, `hooks/` or `lib/`, unless it is the core of a feature others build on (lorebook,
the illustration editors, the character avatar); those are the edges above.

`bun run lint` enforces the layer rules and feature edges (`no-restricted-imports` overrides in
the root `.oxlintrc.json`), and forbids import cycles and `../` imports.

### Code style

- A file is named after what it exports, in kebab-case (`persona-avatar.tsx` → `PersonaAvatar`).
  Hooks are `use-*.ts`; a feature's atoms are `atom.ts`, its pure data helpers `model.ts`.
- **Imports:** `./x` within the same folder, `@/…` for everything else. No `../`. No barrel
  `index.ts` files (`lib/api/index.ts`, the API facade, is the exception).
- **Flat feature folders.** No subfolders inside a feature; tests sit next to their module.
- Tests import `web/test/` helpers through `@test/*`.

## Settings

`features/settings` is only the shell; each section lives in its feature.

- `settings-workspace.tsx` loads data and wires the shared atoms; `settings-panel.tsx` lays out the
  screen, with `settings-navigation`, `settings-controls` and `settings-content` handling the
  menu, close button and section rendering.
- `types.ts` and `navigation.ts` define the supported `/settings/$section` paths and the menu.
- Shared editors take feature behavior through props and callbacks and never import a preset or
  module editor.
- The prompt preset and module `advanced-section` shows the custom toggle textarea directly in the
  "advanced" tab. `components/prompt/prompt-toggle-advanced-editor` owns draft and apply,
  `prompt-toggle-textarea` the input and toolbar, and `lib/prompt-toggle-syntax` conversion and
  validation. Risu-format text is applied only after it validates as a whole and keeps the
  defaults of existing keys and types. Modules pass a limit of 200 toggles, presets 1,000.
