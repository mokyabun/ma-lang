import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { createdAt } from './columns'

export const assets = sqliteTable(
    'assets',
    {
        id: text('id').primaryKey(),
        sha256: text('sha256').notNull(),
        mimeType: text('mime_type').notNull(),
        size: integer('size').notNull(),
        path: text('path').notNull(),
        createdAt: createdAt(),
    },
    (table) => [uniqueIndex('assets_sha256_idx').on(table.sha256)],
)
