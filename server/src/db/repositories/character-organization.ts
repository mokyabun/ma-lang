import type { CharacterOrganization } from '@malang/shared'
import { GENERAL_CHAT_CHARACTER_ID } from '@malang/shared'
import { eq, isNull, max } from 'drizzle-orm'

import { RepositoryBase } from '@/db/repository'

import { characterGroups, characters } from '../schema'

export class CharacterOrganizationRepository extends RepositoryBase {
    update(input: CharacterOrganization): boolean {
        const groupRows = this.db.select({ id: characterGroups.id }).from(characterGroups).all()
        const groupIds = new Set(groupRows.map((group) => group.id))
        const characterRows = this.db.select({ id: characters.id }).from(characters).all()
        const characterIds = new Set(characterRows.map((character) => character.id))
        if (
            input.groups.some((group) => !groupIds.has(group.id)) ||
            input.characters.some(
                (character) =>
                    character.id === GENERAL_CHAT_CHARACTER_ID ||
                    !characterIds.has(character.id) ||
                    (character.groupId !== null && !groupIds.has(character.groupId)),
            )
        ) {
            return false
        }

        const now = new Date()
        this.sqlite.transaction(() => {
            for (const group of input.groups) {
                this.db
                    .update(characterGroups)
                    .set({ sortOrder: group.sortOrder })
                    .where(eq(characterGroups.id, group.id))
                    .run()
            }
            for (const character of input.characters) {
                this.db
                    .update(characters)
                    .set({
                        groupId: character.groupId,
                        sortOrder: character.sortOrder,
                    })
                    .where(eq(characters.id, character.id))
                    .run()
            }
        })()
        return true
    }

    nextRootOrder(): number {
        const itemMax = this.db
            .select({ value: max(characters.sortOrder) })
            .from(characters)
            .where(isNull(characters.groupId))
            .get()?.value
        const groupMax = this.db
            .select({ value: max(characterGroups.sortOrder) })
            .from(characterGroups)
            .get()?.value
        return Math.max(itemMax ?? -1, groupMax ?? -1) + 1
    }
}
