import type { Store } from '@/db'

import type { SecretVault } from './secret-vault'

const sessionLifetimeMs = 30 * 24 * 60 * 60 * 1000

export class AuthService {
    constructor(
        private readonly store: Store,
        private readonly sessionSecret: string,
        private readonly vault: SecretVault,
    ) {}

    async bootstrap(password?: string): Promise<void> {
        if (this.store.admin.get()) {
            if (password) {
                try {
                    await this.vault.unlock(password)
                } catch {
                    // ADMIN_PASSWORD may be stale after an in-app password change.
                }
            }
            return
        }
        if (!password) throw new Error('ADMIN_PASSWORD is required on first startup')
        this.store.admin.create(await Bun.password.hash(password, { algorithm: 'argon2id' }))
        await this.vault.unlock(password)
    }

    async login(password: string): Promise<{ token: string; expiresAt: number } | null> {
        const admin = this.store.admin.get()
        if (!admin || !(await Bun.password.verify(password, admin.passwordHash))) return null
        await this.vault.unlock(password)
        const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
        const expiresAt = Date.now() + sessionLifetimeMs
        this.store.session.create(admin.id, await this.hashToken(token), expiresAt)
        return { token, expiresAt }
    }

    async authenticate(token: string): Promise<{ adminId: string } | null> {
        const session = this.store.session.get(await this.hashToken(token))
        return session ? { adminId: session.adminId } : null
    }

    async logout(token: string): Promise<void> {
        this.store.session.delete(await this.hashToken(token))
    }

    async changePassword(
        adminId: string,
        currentPassword: string,
        newPassword: string,
    ): Promise<boolean> {
        const admin = this.store.admin.get()
        if (
            !admin ||
            admin.id !== adminId ||
            !(await Bun.password.verify(currentPassword, admin.passwordHash))
        )
            return false
        const rotation = await this.vault.prepareRotation(currentPassword, newPassword)
        this.store.credentialRotation.run(
            adminId,
            await Bun.password.hash(newPassword, { algorithm: 'argon2id' }),
            rotation.salt,
            rotation.secrets,
        )
        this.vault.completeRotation(rotation)
        return true
    }

    private async hashToken(token: string): Promise<string> {
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(this.sessionSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign'],
        )
        return Buffer.from(
            await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token)),
        ).toString('hex')
    }
}
