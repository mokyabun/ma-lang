import { and, eq } from 'drizzle-orm'

import { conversationModules } from '../schema'
import { RepositoryBase } from './base'

export class ConversationModuleRepository extends RepositoryBase {
    overrides(conversationId: string): Map<string, boolean> {
        return new Map(
            this.db
                .select()
                .from(conversationModules)
                .where(eq(conversationModules.conversationId, conversationId))
                .all()
                .map((item) => [item.moduleId, item.enabled]),
        )
    }

    set(conversationId: string, moduleId: string, enabled: boolean): void {
        this.db
            .insert(conversationModules)
            .values({ conversationId, moduleId, enabled })
            .onConflictDoUpdate({
                target: [conversationModules.conversationId, conversationModules.moduleId],
                set: { enabled },
            })
            .run()
    }

    reset(conversationId: string, moduleId: string): void {
        this.db
            .delete(conversationModules)
            .where(
                and(
                    eq(conversationModules.conversationId, conversationId),
                    eq(conversationModules.moduleId, moduleId),
                ),
            )
            .run()
    }
}
