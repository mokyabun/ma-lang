import type { IllustrationStyleParams, ImageSizePreset, NovelAIImageParams } from '@malang/shared'

const SLOT = '<<slot>>'
const OUTFIT = '<<outfit>>'
const STATE = '<<state>>'
const WEIGHT_DELIMITER = '::'

/**
 * Splits on top-level commas and newlines. Commas inside `{}`/`[]` emphasis or a
 * `1.2::a, b::` weight block belong to that block.
 */
export function splitTags(text: string): string[] {
    const segments: string[] = []
    let current = ''
    let depth = 0
    let inWeight = false
    for (let index = 0; index < text.length; index++) {
        if (text.startsWith(WEIGHT_DELIMITER, index)) {
            inWeight = !inWeight
            current += WEIGHT_DELIMITER
            index++
            continue
        }
        const character = text[index]!
        if (character === '{' || character === '[') depth++
        if (character === '}' || character === ']') depth = Math.max(0, depth - 1)
        if ((character === ',' || character === '\n') && depth === 0 && !inWeight) {
            segments.push(current)
            current = ''
            continue
        }
        current += character
    }
    segments.push(current)
    return segments
}

function isWeighted(tag: string): boolean {
    return /[{}[\]]/.test(tag) || tag.includes(WEIGHT_DELIMITER)
}

function dedupeKey(tag: string): string {
    return isWeighted(tag) ? tag : tag.toLowerCase().replace(/[\s_]+/g, '')
}

/** Tidies separators and keeps the first of tags that differ only in case, spaces or `_`. */
export function normalizeTags(text: string): string {
    const seen = new Set<string>()
    const tags: string[] = []
    for (const segment of splitTags(text)) {
        const tag = isWeighted(segment) ? segment.trim() : segment.trim().replace(/\s+/g, ' ')
        if (!tag) continue
        const key = dedupeKey(tag)
        if (seen.has(key)) continue
        seen.add(key)
        tags.push(tag)
    }
    return tags.join(', ')
}

export interface TemplateValues {
    slot: string
    /** Only character templates take an outfit and a state. */
    outfit?: string
    state?: string
}

/**
 * Fills `<<slot>>`, `<<outfit>>` and `<<state>>`. A missing slot goes at the end; a missing
 * outfit or state goes right after the slot, outfit first.
 */
export function fillTemplate(template: string, values: TemplateValues): string {
    let filled = template.includes(SLOT) ? template : `${template}, ${SLOT}`
    const trailing = [
        values.outfit !== undefined && !filled.includes(OUTFIT) ? OUTFIT : null,
        values.state !== undefined && !filled.includes(STATE) ? STATE : null,
    ].filter((placeholder) => placeholder !== null)
    if (trailing.length) {
        const index = filled.indexOf(SLOT) + SLOT.length
        filled = `${filled.slice(0, index)}, ${trailing.join(', ')}${filled.slice(index)}`
    }
    return normalizeTags(
        filled
            .replaceAll(SLOT, values.slot)
            .replaceAll(OUTFIT, values.outfit ?? '')
            .replaceAll(STATE, values.state ?? ''),
    )
}

/** Global fixed prompts wrap the inner prompt through `<<slot>>`, or go in front of it. */
export function wrapFixed(fixed: string, inner: string): string {
    return fixed.trim() ? fillTemplate(fixed, { slot: inner }) : normalizeTags(inner)
}

export interface ComposeStyle {
    sceneTemplate: string
    negative: string
    params: IllustrationStyleParams
}

export interface ComposeActor {
    promptTemplate: string
    negative: string
}

export interface ComposeOutfit {
    prompt: string
    negative: string
}

export interface ComposeCharacter {
    actor: ComposeActor
    /** The analysis AI's tags for this character: expression, action, pose. */
    tags: string
    outfit: ComposeOutfit | null
    /** Tags from accumulated state. */
    state: string
}

export interface ComposeInput {
    fixedPositive: string
    fixedNegative: string
    style: ComposeStyle | null
    /** The analysis AI's scene tags: head count, framing, camera, background. */
    scene: string
    characters: ComposeCharacter[]
}

export interface ComposedPrompt {
    positive: string
    negative: string
    characters: Array<{ prompt: string; negative: string }>
}

export function composePrompt(input: ComposeInput): ComposedPrompt {
    const scene = fillTemplate(input.style?.sceneTemplate || SLOT, { slot: input.scene })
    return {
        positive: wrapFixed(input.fixedPositive, scene),
        negative: wrapFixed(input.fixedNegative, input.style?.negative ?? ''),
        characters: input.characters.map((character) => ({
            prompt: fillTemplate(character.actor.promptTemplate, {
                slot: character.tags,
                outfit: character.outfit?.prompt ?? '',
                state: character.state,
            }),
            negative: normalizeTags(
                [character.actor.negative, character.outfit?.negative ?? ''].join(', '),
            ),
        })),
    }
}

/** Style parameters override the global defaults; a chosen size overrides both. */
export function resolveImageParams(
    defaults: NovelAIImageParams,
    style: IllustrationStyleParams | null,
    size?: Pick<ImageSizePreset, 'width' | 'height'> | null,
): NovelAIImageParams {
    const merged = { ...defaults }
    for (const [key, value] of Object.entries(style ?? {})) {
        if (value !== undefined) Object.assign(merged, { [key]: value })
    }
    return size ? { ...merged, width: size.width, height: size.height } : merged
}
