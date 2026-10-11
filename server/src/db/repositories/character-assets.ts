import { eq } from 'drizzle-orm'

import { RepositoryBase } from '@/db/repository'

import { characterAssets } from '../schema'

export class CharacterAssetRepository extends RepositoryBase {
    list(characterId: string) {
        return this.db
            .select()
            .from(characterAssets)
            .where(eq(characterAssets.characterId, characterId))
            .all()
    }
}
