import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { assets } from './assets'
import { timestampColumns } from './columns'

export const personas = sqliteTable('personas', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    note: text('note').notNull().default(''),
    avatarAssetId: text('avatar_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    ...timestampColumns,
})
