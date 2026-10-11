# AGENTS.md

## Code style

- Write code that reads on its own: clear names and small functions instead of explanations.
- Comment only what the code cannot say: the non-obvious *why*, an external constraint (a
  protocol, a RisuAI/PocketRisu quirk being matched, a platform limit) or a trap for the next
  editor. Keep it to one short line where possible.
- No comments that restate the code, narrate steps, repeat a name or signature, or record history
  ("used to", "now", "kept for old callers"). Delete stale comments when changing the code.

## Database (server)

`server/src/db/schema/` (Drizzle, one file per feature) is the single source of truth for the
database structure.

- **Never write raw SQL to create or change tables, columns, indexes or constraints** — not in a
  migration file, not in application code (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, ...).
- To change the structure, edit the table file under `schema/`, then generate the migration with
  the Drizzle CLI:

    ```sh
    cd server
    bun run db:generate --name <short_description>
    ```

    Commit the generated `.sql` file together with `migrations/meta/` (journal and snapshot).
- Register each new generated file in `server/src/db/migrate.ts` under its journal tag. The runner
  fails at startup when a journal entry is not registered.
- Never edit a generated migration or snapshot by hand. A data-only fix belongs in a separate
  migration generated with `bun run db:generate --custom --name <name>`; it may contain DML only.
- `test/db/schema.test.ts` fails when the schema differs from the latest migration snapshot.
- Queries belong in repositories under `server/src/modules/<feature>/repo.ts` (or `repos/`).
  Services compose repositories and never run SQL on the connection directly; only infrastructure
  (backups, health checks) uses `DatabaseHandle`.

## Modules (server)

`server/src/modules/<feature>/` holds one feature: `routes.ts`, `service.ts`, `repo.ts` (or
`repos/`), `mapper.ts`, plus feature-specific files.

- Routes validate the request and call a service; they never touch `context.store` or
  `context.database`.
- Services and repositories are classes with constructor injection, wired in `src/bootstrap.ts`
  and typed in `src/context.ts`.
- Import other modules by file (`@/modules/characters/service`). No module barrels (`index.ts`)
  or `export *`.
- `lib/` and `integrations/` never import `modules/`. `db/` imports only `lib/` and the
  repositories that `store.ts` assembles.

## Web

`web/src/features/<feature>/` holds one feature: flat, tests next to their module. Names follow
`server/src/modules` where the concept matches. Layout and rules are in `web/README.md`.

- `routes/` are stubs that read params and render `AppShell` or a feature page; `app/` composes
  features.
- `components/`, `hooks/` and `lib/` never import `features/` or `app/`; `hooks/` never imports
  `components/`; `lib/` imports only `lib/`. Allowed feature edges are listed in `web/README.md`
  and enforced by `bun run lint`.
- Imports: `./x` in the same folder, `@/…` otherwise, never `../`. No barrels
  (`lib/api/index.ts` is the API facade exception).
- Put code used by several features in `components/`, `hooks/` or `lib/`, not in one of them.

## Tests (server)

`server/test/` mirrors `server/src/`: `lib/`, `integrations/`, `modules/<feature>/`, `db/`.

- A test file sits where its subject sits: `src/modules/x/y.ts` → `test/modules/x/y.test.ts`.
  Name a test of a directory's `index.ts` after the concept (`tokenizer/tokenizer.test.ts`); split
  one src file into `<file>-<topic>.test.ts`.
- HTTP tests are `modules/<feature>/api.test.ts`, where the feature is the module whose
  `routes.ts` serves the endpoint. App-wide behavior (auth wall, errors, 404) is `test/app.test.ts`.
- One test app per file at module scope:

    ```ts
    const t = await createTestApp()
    afterAll(() => t.close())
    ```

    A test that changes global state (admin password, `t.reopen()`) creates its own app.
- Tests are independent: each creates its data with the `helpers/fixtures.ts` factories
  (`importCard`, `createConversation`, `createEchoPreset`, ...). Nothing is passed between tests;
  `bun test <file> -t '<title>'` passes for any single test.
- Test behavior through the API (`t.send`, `t.call`); use services (`t.context.<service>`) only
  to set up data the test is not about, and `t.context.store` only for state the API does not
  expose.
- Never hand-roll `mkdtempSync` + `createContext`; use `createTestApp`. Only tests that open the
  database on purpose (`db/schema`, `modules/jobs/runner`, `modules/system/backups`) skip it.
- Import helpers by file (`../../helpers/app`); `helpers/` has no barrel.
- Commit only fixtures you may redistribute, under `test/fixtures/`. Third-party files go in the
  gitignored `test/fixtures/local/` and their tests use `test.skipIf(!localFixture(name))`.
- `pocketrisu-parity/` stays at the top level: package scripts and its golden file depend on it.
