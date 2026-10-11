import {
    type CompiledMessage,
    type IllustrationCount,
    MAX_ILLUSTRATION_CHARACTERS,
} from '@malang/shared'
import { z } from 'zod'

export interface RosterActor {
    /** Short handle the analysis AI uses instead of an id. */
    ref: string
    name: string
    keys: string[]
    outfits: string[]
    defaultOutfit: string | null
    /** The user's persona rather than a story character. */
    isUser: boolean
}

/** A state the analysis AI may set, as it is shown to the model. */
export interface AnalysisStateDefinition {
    key: string
    label: string
    kind: 'flag' | 'counter' | 'choice'
    instruction: string
    options?: string[]
}

export interface AnalysisContinuity {
    present: string[]
    /** Actor ref → current outfit name. */
    outfits: Record<string, string>
    /** Refs whose outfit the user locked; their outfit changes are ignored. */
    locked: string[]
    /** Actor ref → state key → value. */
    states: Record<string, Record<string, true | number | string>>
}

export interface AnalysisInput {
    roster: RosterActor[]
    continuity: AnalysisContinuity
    stateDefinitions: AnalysisStateDefinition[]
    context: Array<{ role: 'user' | 'assistant'; text: string }>
    slots: Array<{ slot: number; text: string }>
    /** Null asks for continuity only, with no illustrations. */
    count: IllustrationCount | null
    sizes: string[]
    sceneDirection: string
}

const TagsSchema = z
    .string()
    .nullish()
    .transform((value) => value ?? '')

const AnalysisOutputSchema = z.object({
    illustrations: z.array(
        z.object({
            slot: z.coerce.number().int(),
            size: z.string().nullish(),
            scene: TagsSchema,
            characters: z
                .array(z.object({ actor: z.string(), tags: TagsSchema }))
                .nullish()
                .transform((value) => value ?? []),
        }),
    ),
    continuity: z
        .object({
            present: z.array(z.string()).nullish(),
            outfits: z
                .array(
                    z.object({
                        actor: z.string(),
                        outfit: z.string(),
                        reason: z.string().nullish(),
                    }),
                )
                .nullish(),
            newOutfits: z
                .array(z.object({ actor: z.string(), name: z.string(), tags: z.string() }))
                .nullish(),
            states: z
                .array(
                    z.object({
                        actor: z.string(),
                        key: z.string(),
                        op: z.enum(['set', 'clear', 'increment', 'choose']),
                        value: z.union([z.string(), z.number()]).nullish(),
                    }),
                )
                .nullish(),
        })
        .nullish()
        .transform((value) => value ?? {}),
})

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>

export interface PlannedIllustration {
    slot: number
    size: string | null
    scene: string
    characters: Array<{ ref: string; tags: string }>
    /** The AI's entry, kept for the record. */
    raw: AnalysisOutput['illustrations'][number]
}

export interface AnalysisPlan {
    illustrations: PlannedIllustration[]
    continuity: AnalysisOutput['continuity']
    warnings: string[]
}

const OUTPUT_FORMAT = `Answer with one JSON object and nothing else:
{
  "illustrations": [
    {
      "slot": <paragraph slot number>,
      "size": <one of the size names, or null>,
      "scene": "<scene tags>",
      "characters": [{ "actor": "<roster ref>", "tags": "<this character's tags>" }]
    }
  ],
  "continuity": {
    "present": ["<roster ref>"],
    "outfits": [{ "actor": "<roster ref>", "outfit": "<registered outfit name>", "reason": "<short reason>" }],
    "newOutfits": [{ "actor": "<roster ref>", "name": "<short name>", "tags": "<outfit tags>" }],
    "states": [{ "actor": "<roster ref>", "key": "<state key>", "op": "set|clear|increment|choose", "value": <number or option when needed> }]
  }
}
Report only what changed in this reply under outfits, newOutfits and states.
List illustrations in slot order, at most one per slot, at most ${MAX_ILLUSTRATION_CHARACTERS} characters each.`

export function buildAnalysisMessages(
    instruction: string,
    input: AnalysisInput,
): CompiledMessage[] {
    return [
        { role: 'system', content: `${instruction.trim()}\n\n${OUTPUT_FORMAT}` },
        {
            role: 'user',
            content: JSON.stringify(
                {
                    task: analysisTask(input),
                    roster: input.roster,
                    continuity: input.continuity,
                    stateDefinitions: input.stateDefinitions,
                    context: input.context,
                    latest: { slots: input.slots },
                    instructions: {
                        count: input.count,
                        sizes: input.sizes,
                        sceneDirection: input.sceneDirection || undefined,
                    },
                },
                null,
                2,
            ),
        },
    ]
}

function analysisTask(input: AnalysisInput): string {
    const { count } = input
    if (!count) {
        return 'Do not plan illustrations; return an empty illustrations list and only report the continuity changes of the latest reply.'
    }
    const wanted =
        count.min === count.max
            ? `exactly ${count.min}`
            : `between ${count.min} and ${count.max}, as the reply warrants`
    return `Plan ${wanted} illustrations for the latest reply (never more than its ${input.slots.length} slots).`
}

/** Pulls the JSON object out of a reply that may wrap it in thoughts or a code fence. */
export function parseAnalysisOutput(
    text: string,
): { ok: true; value: AnalysisOutput } | { ok: false; error: string } {
    const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<Thoughts>[\s\S]*?<\/Thoughts>/gi, '')
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start)
        return { ok: false, error: 'The reply contains no JSON object.' }
    let json: unknown
    try {
        json = JSON.parse(cleaned.slice(start, end + 1))
    } catch (error) {
        return { ok: false, error: `The JSON is invalid: ${(error as Error).message}` }
    }
    const parsed = AnalysisOutputSchema.safeParse(json)
    if (parsed.success) return { ok: true, value: parsed.data }
    return {
        ok: false,
        error: parsed.error.issues
            .slice(0, 10)
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('\n'),
    }
}

/** Keeps only what can be drawn: known slots, sizes and actors, within the count. */
export function normalizeAnalysis(output: AnalysisOutput, input: AnalysisInput): AnalysisPlan {
    const warnings: string[] = []
    const refs = new Set(input.roster.map((actor) => actor.ref))
    const sizes = new Set(input.sizes)
    const slotCount = input.slots.length
    const seen = new Set<number>()
    const illustrations: PlannedIllustration[] = []
    // A continuity-only analysis ignores any illustrations the model planned anyway.
    const max = input.count?.max ?? 0
    const min = input.count?.min ?? 0
    const entries = input.count ? output.illustrations : []

    for (const entry of [...entries].sort((left, right) => left.slot - right.slot)) {
        if (entry.slot < 1 || entry.slot > slotCount) {
            warnings.push(`Dropped an illustration for missing slot ${entry.slot}`)
            continue
        }
        if (seen.has(entry.slot)) {
            warnings.push(`Dropped a second illustration for slot ${entry.slot}`)
            continue
        }
        if (illustrations.length >= max) {
            warnings.push(`Dropped illustrations beyond the maximum of ${max}`)
            break
        }
        seen.add(entry.slot)
        const characters: PlannedIllustration['characters'] = []
        for (const character of entry.characters) {
            if (!refs.has(character.actor)) {
                warnings.push(`Ignored unknown actor "${character.actor}"`)
                continue
            }
            if (characters.some((item) => item.ref === character.actor)) continue
            if (characters.length >= MAX_ILLUSTRATION_CHARACTERS) break
            characters.push({ ref: character.actor, tags: character.tags })
        }
        if (entry.size && !sizes.has(entry.size))
            warnings.push(`Ignored unknown size "${entry.size}"`)
        illustrations.push({
            slot: entry.slot,
            size: entry.size && sizes.has(entry.size) ? entry.size : null,
            scene: entry.scene,
            characters,
            raw: entry,
        })
    }
    if (illustrations.length < Math.min(min, slotCount)) {
        warnings.push(`Planned ${illustrations.length} illustrations; at least ${min} were asked`)
    }
    return { illustrations, continuity: output.continuity, warnings }
}

export class AnalysisFailedError extends Error {
    constructor(
        message: string,
        readonly reply: string,
    ) {
        super(message)
        this.name = 'AnalysisFailedError'
    }
}

/** Asks the model once more, with the validation error, when its first answer is unusable. */
export async function runAnalysis(
    complete: (messages: CompiledMessage[]) => Promise<string>,
    instruction: string,
    input: AnalysisInput,
): Promise<AnalysisPlan> {
    const messages = buildAnalysisMessages(instruction, input)
    const first = await complete(messages)
    const parsed = parseAnalysisOutput(first)
    if (parsed.ok) return normalizeAnalysis(parsed.value, input)

    const repaired = await complete([
        ...messages,
        { role: 'assistant', content: first },
        {
            role: 'user',
            content: `That answer could not be used:\n${parsed.error}\n\nReply again with only the corrected JSON object.`,
        },
    ])
    const retry = parseAnalysisOutput(repaired)
    if (retry.ok) return normalizeAnalysis(retry.value, input)
    throw new AnalysisFailedError(
        `The analysis model returned unusable output: ${retry.error}`,
        repaired,
    )
}

/** Unique, readable handles for roster actors. */
export function actorRefs(names: string[]): string[] {
    const used = new Set<string>()
    return names.map((name) => {
        const base =
            name
                .normalize('NFKC')
                .toLocaleLowerCase()
                .replace(/[^\p{L}\p{N}]+/gu, '_')
                .replace(/^_+|_+$/g, '') || 'actor'
        let ref = base
        for (let suffix = 2; used.has(ref); suffix++) ref = `${base}_${suffix}`
        used.add(ref)
        return ref
    })
}
