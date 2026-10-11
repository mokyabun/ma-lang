import { and, eq, gt, lt } from 'drizzle-orm'

import { RepositoryBase } from '@/db/repository'

import { sessions } from '../schema'

export class SessionRepository extends RepositoryBase {
    create(adminId: string, tokenHash: string, expiresAt: number): string {
        const id = crypto.randomUUID()
        this.db
            .insert(sessions)
            .values({ id, adminId, tokenHash, expiresAt: new Date(expiresAt) })
            .run()
        return id
    }

    get(tokenHash: string) {
        this.db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run()
        return this.db
            .select({ id: sessions.id, adminId: sessions.adminId, expiresAt: sessions.expiresAt })
            .from(sessions)
            .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
            .get()
    }

    delete(tokenHash: string): void {
        this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run()
    }
}
