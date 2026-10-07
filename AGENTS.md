# AGENTS.md

## Database (server)

`server/src/db/schema.ts` (Drizzle) is the single source of truth for the database structure.

- **Never write raw SQL to create or change tables, columns, indexes or constraints** — not in a
  migration file, not in application code (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, ...).
- To change the structure, edit `schema.ts`, then generate the migration with the Drizzle CLI:

    ```sh
    cd server
    bun run db:generate --name <short_description>
    ```

    Commit the generated `.sql` file together with `migrations/meta/` (journal and snapshot).
- Register each new generated file in `server/src/db/migrate.ts` under its journal tag. The runner
  fails at startup when a journal entry is not registered.
- Never edit a generated migration or snapshot by hand. A data-only fix belongs in a separate
  migration generated with `bun run db:generate --custom --name <name>`; it may contain DML only.
- `test/db-schema.test.ts` fails when `schema.ts` differs from the latest migration snapshot.
- Queries belong in repositories under `server/src/db/repositories/`. Services and routes compose
  repositories and never run SQL on the connection directly; only infrastructure (backups, health
  checks) uses `DatabaseHandle`.
