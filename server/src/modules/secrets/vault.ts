import { z } from 'zod'

import type { SecretEnvelopes, SecretSlot, Store } from '@/db'
import { ValidationError } from '@/lib/errors/app-error'

const iterations = 600_000
// Binding each slot to its own AAD keeps one ciphertext from being replayed into another slot.
const additionalData: Record<SecretSlot, Uint8Array> = {
    provider: new TextEncoder().encode('malang:provider-api-key:v1'),
    novelai: new TextEncoder().encode('malang:novelai-api-key:v1'),
}
const SecretEnvelopeSchema = z.object({
    version: z.literal(1),
    algorithm: z.literal('AES-256-GCM'),
    iv: z.string(),
    ciphertext: z.string(),
})

type SecretEnvelope = z.infer<typeof SecretEnvelopeSchema>

export class SecretVaultLockedError extends ValidationError {
    constructor() {
        super(
            'Encrypted provider credentials are locked; sign out and sign in again to unlock them',
        )
        this.name = 'SecretVaultLockedError'
    }
}

export class SecretVaultCorruptedError extends Error {
    constructor() {
        super('The encrypted provider credentials could not be decrypted')
        this.name = 'SecretVaultCorruptedError'
    }
}

export interface SecretRotation {
    key: CryptoKey
    salt: string
    secrets: SecretEnvelopes
}

export class SecretVault {
    private key: CryptoKey | null = null

    constructor(private readonly store: Store) {}

    isLocked(): boolean {
        return !this.key && Object.values(this.store.secretStorage.get().secrets).some(Boolean)
    }

    lock(): void {
        this.key = null
    }

    hasSecret(slot: SecretSlot): boolean {
        return this.store.secretStorage.get().secrets[slot] !== null
    }

    async unlock(password: string): Promise<void> {
        const storage = this.store.secretStorage.get()
        const salt = storage.salt ?? encode(randomBytes(16))
        if (!storage.salt) {
            this.store.secretStorage.setSalt(salt)
        }

        const key = await deriveKey(password, decode(salt))
        for (const [slot, envelope] of entries(storage.secrets)) {
            if (envelope) await decrypt(slot, envelope, key)
        }
        this.key = key
    }

    async get(slot: SecretSlot): Promise<string | null> {
        const secret = this.store.secretStorage.get().secrets[slot]
        if (!secret) return null
        if (!this.key) throw new SecretVaultLockedError()
        return decrypt(slot, secret, this.key)
    }

    async set(slot: SecretSlot, value: string): Promise<void> {
        if (!this.key) throw new SecretVaultLockedError()
        this.store.secretStorage.setSecret(slot, await encrypt(slot, value, this.key))
    }

    clear(slot: SecretSlot): void {
        this.store.secretStorage.setSecret(slot, null)
    }

    async prepareRotation(currentPassword: string, newPassword: string): Promise<SecretRotation> {
        const storage = this.store.secretStorage.get()
        const present = entries(storage.secrets).filter(([, envelope]) => envelope !== null)
        let oldKey: CryptoKey | null = null
        if (present.length) {
            if (!storage.salt) throw new SecretVaultCorruptedError()
            oldKey = await deriveKey(currentPassword, decode(storage.salt))
        }

        const saltBytes = randomBytes(16)
        const key = await deriveKey(newPassword, saltBytes)
        const secrets: SecretEnvelopes = { provider: null, novelai: null }
        for (const [slot, envelope] of present) {
            const value = await decrypt(slot, envelope!, oldKey!)
            secrets[slot] = await encrypt(slot, value, key)
        }
        return { key, salt: encode(saltBytes), secrets }
    }

    completeRotation(rotation: SecretRotation): void {
        this.key = rotation.key
    }
}

function entries(secrets: SecretEnvelopes) {
    return Object.entries(secrets) as Array<[SecretSlot, string | null]>
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey'],
    )
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    )
}

async function encrypt(slot: SecretSlot, value: string, key: CryptoKey): Promise<string> {
    const iv = randomBytes(12)
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: additionalData[slot] },
        key,
        new TextEncoder().encode(value),
    )
    const envelope: SecretEnvelope = {
        version: 1,
        algorithm: 'AES-256-GCM',
        iv: encode(iv),
        ciphertext: encode(new Uint8Array(ciphertext)),
    }
    return JSON.stringify(envelope)
}

async function decrypt(slot: SecretSlot, value: string, key: CryptoKey): Promise<string> {
    try {
        const envelope = SecretEnvelopeSchema.parse(JSON.parse(value))
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: decode(envelope.iv), additionalData: additionalData[slot] },
            key,
            decode(envelope.ciphertext),
        )
        return new TextDecoder().decode(plaintext)
    } catch {
        throw new SecretVaultCorruptedError()
    }
}

function randomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length))
}

function encode(value: Uint8Array): string {
    return Buffer.from(value).toString('base64url')
}

function decode(value: string): Uint8Array {
    return new Uint8Array(Buffer.from(value, 'base64url'))
}
