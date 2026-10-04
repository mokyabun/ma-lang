import { renderTemplate, type TemplateContext } from '../template-engine'

/** A stored chat message as PocketRisu's chat.message holds it (greeting excluded). */
export interface ChatTurn {
    id: string
    role: 'user' | 'char'
    data: string
}

// PocketRisu leaves {{slot}} for the caller to fill after parsing (its callback is
// doc-only), while Malang's engine resolves it; shield it through the render.
const SLOT = 'slot'

/**
 * risuChatParser bound to one chat: chat variables are shared, mutable state
 * (runVar renders write back like setChatVar), and message CBS read the live
 * chat, including messages already rewritten by runCurrentChatFunction.
 */
export class RisuParser {
    readonly variables: Record<string, string>
    private readonly engineMessages: NonNullable<TemplateContext['messages']>

    constructor(
        private readonly base: Omit<TemplateContext, 'variables' | 'messages' | 'pocketRisu'>,
        variables: Record<string, string>,
        private readonly variableDefaults: Record<string, string>,
        readonly chat: ChatTurn[],
        /** The chat's selected greeting from the character, as PocketRisu reads it. */
        private readonly greeting: string,
        private readonly warnings: string[],
    ) {
        this.variables = { ...variables }
        this.engineMessages = chat.map((turn) => ({
            role: turn.role === 'char' ? 'assistant' : 'user',
            content: turn.data,
        }))
    }

    /** Rewrites a stored message the way runCurrentChatFunction assigns `v.data`. */
    setData(index: number, data: string) {
        const turn = this.chat[index]
        const message = this.engineMessages[index]
        if (!turn || !message) return
        turn.data = data
        message.content = data
    }

    getChatVar(key: string): string {
        return this.variables[key] ?? this.variableDefaults[key] ?? 'null'
    }

    setChatVar(key: string, value: string) {
        this.variables[key] = value
    }

    parse(
        text: string,
        options: {
            runVar?: boolean
            /** Drop variable commands instead of leaving them as text (chat display). */
            rmVar?: boolean
            /** Chat display rendering of {{comment}} and {{file}}. */
            visualize?: boolean
            role?: string
            chatId?: number
        } = {},
    ): string {
        const result = renderTemplate(text.replaceAll('{{slot}}', SLOT), {
            ...this.base,
            variables: this.variables,
            messages: this.engineMessages,
            pocketRisu: {
                variableMode: options.runVar ? 'run' : options.rmVar ? 'remove' : 'keep',
                variableDefaults: this.variableDefaults,
                chatId: options.chatId ?? -1,
                role: options.role,
                greeting: this.greeting,
                displaying: options.visualize,
            },
        })
        this.warnings.push(...result.warnings)
        if (options.runVar) {
            for (const key of Object.keys(this.variables)) delete this.variables[key]
            Object.assign(this.variables, result.variables)
        }
        return result.text.replaceAll(SLOT, '{{slot}}')
    }
}
