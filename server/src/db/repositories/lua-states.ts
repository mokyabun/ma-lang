import { RepositoryBase } from './base'

export class LuaStateRepository extends RepositoryBase {
    upsert(input: {
        conversationId: string
        ownerType: string
        ownerId: string
        key: string
        value: unknown
    }): void {
        this.sqlite
            .query(
                `INSERT INTO lua_states
                 (conversation_id, owner_type, owner_id, state_key, value_json, version, updated_at)
                 VALUES (?, ?, ?, ?, ?, 1, ?)
                 ON CONFLICT(conversation_id, owner_type, owner_id, state_key) DO UPDATE SET
                   value_json = excluded.value_json,
                   version = lua_states.version + 1,
                   updated_at = excluded.updated_at`,
            )
            .run(
                input.conversationId,
                input.ownerType,
                input.ownerId,
                input.key,
                JSON.stringify(input.value),
                Date.now(),
            )
    }
}
