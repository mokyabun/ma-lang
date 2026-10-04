import type { RisuChat } from './types'

/**
 * Port of PocketRisu's exampleMessage (process/exampleMessages.ts), including its
 * quirks: `<START>` emits a `[Start a new chat]` turn, and a speaker line keeps
 * only the text between the first and second colon.
 */
export function exampleMessage(
    exampleText: string,
    charName: string,
    parse: (text: string) => string,
): RisuChat[] {
    if (exampleText === '') return []

    let result: RisuChat[] = []
    let current: RisuChat | null = null
    const add = () => {
        if (current) result.push(current)
    }

    for (const line of exampleText.split('\n')) {
        const trimmed = line.trim()
        const lowered = trimmed.toLocaleLowerCase()
        if (lowered === '<start>') {
            add()
            result.push({ role: 'system', content: '[Start a new chat]', memo: 'NewChatExample' })
            current = null
        } else if (
            lowered.startsWith('{{char}}:') ||
            lowered.startsWith('<bot>:') ||
            lowered.startsWith(`${charName}:`)
        ) {
            add()
            current = {
                role: 'assistant',
                content: (trimmed.split(':', 2)[1] ?? '').trimStart(),
                name: 'example_assistant',
            }
        } else if (lowered.startsWith('{{user}}:') || lowered.startsWith('<user>:')) {
            add()
            current = {
                role: 'user',
                content: (trimmed.split(':', 2)[1] ?? '').trimStart(),
                name: 'example_user',
            }
        } else if (current) {
            current.content += `\n${trimmed}`
        }
    }
    add()

    result = result.map((chat) => ({
        role: chat.role,
        content: parse(chat.content),
        name: chat.name,
        memo: chat.memo,
    }))
    return result
}
