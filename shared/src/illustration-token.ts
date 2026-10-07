const TOKEN_SOURCE = String.raw`\{\{illustration::([^{}\s]+)\}\}`

/** Matches `{{illustration::<id>}}`; the id is capture group 1. */
export function illustrationTokenPattern(): RegExp {
    return new RegExp(TOKEN_SOURCE, 'g')
}

export function illustrationToken(id: string): string {
    return `{{illustration::${id}}}`
}

export function illustrationTokenIds(text: string): string[] {
    return Array.from(text.matchAll(illustrationTokenPattern()), (match) => match[1]!)
}

/** Removes tokens together with the blank-line block each one was inserted as. */
export function stripIllustrationTokens(text: string): string {
    const block = new RegExp(String.raw`(\n*)([ \t]*)${TOKEN_SOURCE}([ \t]*)(\n*)`, 'g')
    return text.replace(
        block,
        (
            match,
            before: string,
            leading: string,
            _id: string,
            trailing: string,
            after: string,
            offset: number,
        ) => {
            if (offset === 0 || offset + match.length === text.length) return ''
            if (before || after) return before.length >= after.length ? before : after
            return leading || trailing ? ' ' : ''
        },
    )
}
