import type {
    AppSettings,
    Conversation,
    EffectivePersona,
    PersonaCreate,
    PersonaUpdate,
} from '@malang/shared'

import type { Store } from '@/db'
import { ValidationError } from '@/lib/errors/app-error'
import type { AssetStore } from '@/modules/assets/service'

export class PersonaService {
    constructor(
        private readonly store: Store,
        private readonly assetStore: AssetStore,
    ) {}

    list() {
        return this.store.persona.list()
    }

    get(id: string) {
        return this.store.persona.get(id)
    }

    create(input: PersonaCreate) {
        return this.store.persona.create(input)
    }

    update(id: string, input: PersonaUpdate) {
        return this.store.persona.update(id, input)
    }

    delete(id: string) {
        return this.store.persona.delete(id)
    }

    async setAvatar(id: string, bytes: Uint8Array, mimeType: string) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType)) {
            throw new ValidationError('Avatar must be a PNG, JPEG, WebP, or GIF image')
        }
        if (!this.store.persona.get(id)) return null
        const asset = await this.assetStore.put(bytes, mimeType)
        return this.store.persona.setAvatar(id, asset.id)
    }

    removeAvatar(id: string) {
        return this.store.persona.setAvatar(id, null)
    }

    effectiveFor(conversation: Conversation | null, settings: AppSettings): EffectivePersona {
        if (conversation?.personaLocked) {
            const selected = conversation.boundPersonaId
                ? this.store.persona.get(conversation.boundPersonaId)
                : null
            if (selected) {
                return {
                    id: selected.id,
                    name: selected.name,
                    description: selected.description,
                    avatarAssetId: selected.avatarAssetId,
                    source: 'conversation',
                }
            }
            return {
                id: null,
                name: settings.userName,
                description: '',
                avatarAssetId: null,
                source: 'conversation',
            }
        }
        if (settings.selectedPersonaId) {
            const selected = this.store.persona.get(settings.selectedPersonaId)
            if (selected) {
                return {
                    id: selected.id,
                    name: selected.name,
                    description: selected.description,
                    avatarAssetId: selected.avatarAssetId,
                    source: 'global',
                }
            }
        }
        return {
            id: null,
            name: settings.userName,
            description: '',
            avatarAssetId: null,
            source: 'default',
        }
    }
}
