import { eq } from 'drizzle-orm'

import { adminUsers, appSettings, sessions } from '../schema'
import { RepositoryBase } from './base'
import { SECRET_SLOTS, type SecretEnvelopes, writeSecret } from './secret-storage'

export class CredentialRotationRepository extends RepositoryBase {
    run(adminId: string, passwordHash: string, secretSalt: string, secrets: SecretEnvelopes): void {
        this.sqlite.transaction(() => {
            this.db.update(adminUsers).set({ passwordHash }).where(eq(adminUsers.id, adminId)).run()
            this.db.update(appSettings).set({ secretSalt }).where(eq(appSettings.id, 1)).run()
            for (const slot of SECRET_SLOTS) writeSecret(this.db, slot, secrets[slot])
            this.db.delete(sessions).where(eq(sessions.adminId, adminId)).run()
        })()
    }
}
