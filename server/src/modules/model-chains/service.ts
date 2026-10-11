import type { ModelChainPresetInput } from '@malang/shared'

import type { Store } from '@/db'
import { ValidationError } from '@/lib/errors/app-error'
import type { ProviderService } from '@/modules/providers/service'

export class ModelChainService {
    constructor(
        private readonly store: Store,
        private readonly providers: ProviderService,
    ) {}

    list() {
        return this.store.modelChain.list()
    }

    get(id: string) {
        return this.store.modelChain.get(id)
    }

    create(input: ModelChainPresetInput) {
        this.validateStepModels(input)
        return this.store.modelChain.create(input)
    }

    update(id: string, input: ModelChainPresetInput) {
        this.validateStepModels(input)
        return this.store.modelChain.update(id, input)
    }

    delete(id: string) {
        return this.store.modelChain.delete(id)
    }

    private validateStepModels(input: ModelChainPresetInput) {
        const missing = input.layers
            .flatMap((layer) => layer.agents)
            .find((agent) => !this.providers.getModelPreset(agent.modelPresetId))
        if (missing) {
            throw new ValidationError(`Model preset for agent “${missing.name}” does not exist`)
        }
    }
}
