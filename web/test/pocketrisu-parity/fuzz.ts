import type { DisplayCase, ScenarioRegexScript } from '../../../scripts/pocketrisu-oracle/protocol'
import { markupCases } from './cases'

/** Deterministic PRNG so a failing seed always reproduces the same inputs. */
function mulberry32(seed: number) {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
    }
}

const SEPARATORS = ['', ' ', '\n', '\n\n', '  \n']

const EXTRA_FRAGMENTS = [
    '"',
    "'",
    '*',
    '**',
    '`',
    '<',
    '>',
    '&',
    '#',
    '- ',
    '> ',
    '|',
    '$$',
    '<br>',
    '</div>',
    '<span class="tag">',
    '</span>',
    '<p>',
    '...',
    '--',
    '안녕',
]

const CBS_FRAGMENTS = [
    '{{user}}',
    '{{char}}',
    '<user>',
    '<char>',
    '{{getvar::mood}}',
    '{{getvar::unset}}',
    '{{getglobalvar::season}}',
    '{{setvar::mood::sad}}',
    '{{#if 1}}yes{{/if}}',
    '{{#if 0}}no{{/if}}',
    '{{? 2*3}}',
    '{{br}}',
    '{{bo}}',
    '{{bc}}',
    '{{// note}}',
    '{{lastmessageid}}',
    '{{unknown_cbs}}',
]

const REGEX_POOL: ScenarioRegexScript[] = [
    { in: '\\[\\[(.+?)\\]\\]', out: '<b>$1</b>' },
    { in: 'Ari', out: '**Ari**' },
    { in: '(\\w+):', out: '$1 —', flag: 'g' },
    { in: 'mood', out: '{{char}}', flag: 'gi' },
    { in: '\\n', out: ' ' },
    { in: 'STATUS', out: '<div class="st">ok</div>' },
    { in: '"(.+?)"', out: '<q>$1</q>' },
]

function fragmentPool(): string[] {
    const pieces = markupCases
        .flatMap((entry) => entry.input.split('\n'))
        .filter((line) => line.trim().length > 0)
    return [...new Set([...pieces, ...EXTRA_FRAGMENTS])]
}

/** Random compositions of corpus fragments; ids embed the seed for reproduction. */
export function fuzzCases(seed: number, markupCount: number, messageCount: number): DisplayCase[] {
    const random = mulberry32(seed)
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
    const compose = (pool: readonly string[], min: number, max: number) => {
        const count = min + Math.floor(random() * (max - min + 1))
        let text = ''
        for (let index = 0; index < count; index += 1) {
            text += (index ? pick(SEPARATORS) : '') + pick(pool)
        }
        return text
    }

    const pool = fragmentPool()
    const cases: DisplayCase[] = []
    for (let index = 0; index < markupCount; index += 1) {
        cases.push({
            kind: 'markup',
            id: `fuzz/${seed}/markup/${index}`,
            input: compose(pool, 1, 5),
        })
    }
    for (let index = 0; index < messageCount; index += 1) {
        const text = compose([...pool, ...CBS_FRAGMENTS, ...CBS_FRAGMENTS], 2, 6)
        const regex = random() < 0.5 ? [pick(REGEX_POOL)] : []
        cases.push({
            kind: 'message',
            id: `fuzz/${seed}/message/${index}`,
            scenario: {
                userName: 'Mina',
                charName: 'Ari',
                index: 1,
                messages: [
                    { role: 'user', content: 'hi' },
                    { role: 'char', content: text },
                ],
                chatVariables: { mood: 'happy' },
                globalVariables: { season: 'winter' },
                regex,
            },
        })
    }
    return cases
}
