import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { createdAt, timestampColumns, timestampMs } from './columns'

export const adminUsers = sqliteTable('admin_users', {
    id: text('id').primaryKey(),
    passwordHash: text('password_hash').notNull(),
    ...timestampColumns,
})

export const sessions = sqliteTable(
    'sessions',
    {
        id: text('id').primaryKey(),
        adminId: text('admin_id')
            .notNull()
            .references(() => adminUsers.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').notNull(),
        expiresAt: timestampMs('expires_at').notNull(),
        createdAt: createdAt(),
    },
    (table) => [uniqueIndex('sessions_token_hash_idx').on(table.tokenHash)],
)
