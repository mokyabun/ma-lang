import type { AppSettings } from '@malang/shared'

import type { Store } from '@/db'

export class SettingsService {
    constructor(private readonly store: Store) {}

    get() {
        return this.store.settings.get()
    }

    update(patch: Partial<AppSettings>) {
        return this.store.settings.update(patch)
    }
}
