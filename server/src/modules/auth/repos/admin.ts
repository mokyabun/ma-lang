import { eq } from 'drizzle-orm'

import { RepositoryBase } from '@/db/repository'
import { adminUsers, sessions } from '@/db/schema'

export class AdminRepository extends RepositoryBase {
    get() {
        return this.db.select().from(adminUsers).limit(1).get()
    }

    create(passwordHash: string) {
        const now = new Date()
        const admin = { id: crypto.randomUUID(), passwordHash, createdAt: now, updatedAt: now }
        this.db.insert(adminUsers).values(admin).run()
        return admin
    }

    updatePassword(adminId: string, passwordHash: string): void {
        this.db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, adminId)).run()
        this.db.delete(sessions).where(eq(sessions.adminId, adminId)).run()
    }
}
