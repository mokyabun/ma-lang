import { and, eq } from 'drizzle-orm'

import { RepositoryBase } from '@/db/repository'
import { modelChainAgentMemories } from '@/db/schema'

export class ModelChainMemoryRepository extends RepositoryBase {
    get(conversationId: string, agentId: string): string {
        return (
            this.db
                .select({ content: modelChainAgentMemories.content })
                .from(modelChainAgentMemories)
                .where(
                    and(
                        eq(modelChainAgentMemories.conversationId, conversationId),
                        eq(modelChainAgentMemories.agentId, agentId),
                    ),
                )
                .get()?.content ?? ''
        )
    }

    set(conversationId: string, agentId: string, content: string): void {
        this.db
            .insert(modelChainAgentMemories)
            .values({ conversationId, agentId, content, updatedAt: new Date() })
            .onConflictDoUpdate({
                target: [modelChainAgentMemories.conversationId, modelChainAgentMemories.agentId],
                set: { content },
            })
            .run()
    }
}
