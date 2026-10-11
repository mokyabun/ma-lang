import { sql } from 'drizzle-orm'
import { integer } from 'drizzle-orm/sqlite-core'

export type JsonObject = Record<string, unknown>
export type StringMap = Record<string, string>

export const timestampMs = (name: string) => integer(name, { mode: 'timestamp_ms' })
export const createdAt = () =>
    timestampMs('created_at')
        .notNull()
        .default(sql`(unixepoch('subsecond') * 1000)`)
export const updatedAt = () =>
    timestampMs('updated_at')
        .notNull()
        .default(sql`(unixepoch('subsecond') * 1000)`)
        .$onUpdate(() => new Date())

export const timestampColumns = {
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}
