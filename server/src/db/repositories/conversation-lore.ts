import { RepositoryBase } from './base'

/** Lorebook entries Lua scripts add to a single conversation, keyed by entry name. */
export class ConversationLoreRepository extends RepositoryBase {
    list(conversationId: string): unknown[] {
        return this.sqlite
            .query<{ entry_json: string }, [string]>(
                'SELECT entry_json FROM conversation_lore_entries WHERE conversation_id = ?',
            )
            .all(conversationId)
            .map((row) => JSON.parse(row.entry_json))
    }

    upsert(conversationId: string, name: string, entry: unknown): void {
        this.sqlite
            .query(
                `INSERT INTO conversation_lore_entries (id, conversation_id, name, entry_json, updated_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(conversation_id, name) DO UPDATE
                 SET entry_json = excluded.entry_json, updated_at = excluded.updated_at`,
            )
            .run(crypto.randomUUID(), conversationId, name, JSON.stringify(entry), Date.now())
    }
}
