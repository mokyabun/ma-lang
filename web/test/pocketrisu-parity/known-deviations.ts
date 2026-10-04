// Cases where Malang's rendering intentionally differs from PocketRisu. They still
// run as `test.failing`: each must keep differing, so changing the behavior turns
// its test red until its entry is removed here. PARITY_STRICT=1 ignores this list
// and runs every case as a plain equality test.

const LINK_REL = 'External links also get rel="noopener noreferrer"'

export const KNOWN_DEVIATIONS: Record<string, string> = {
    'markup/links': LINK_REL,
    'markup/autolinks': LINK_REL,
    'markup/reference-link': LINK_REL,
    'markup/html-links': LINK_REL,
    // PocketRisu injects such a block unscoped, so it could restyle the whole app.
    'markup/style-with-attributes': '<style> with attributes is scoped like a plain <style>',
}

/**
 * Fuzzed inputs have no stable ids, so the live suite discounts the same two
 * intentional differences by shape: the extra link `rel`, and any input with an
 * attributed <style> block. `pocketRisu` and `malang` are canonical HTML.
 */
export function isKnownDeviation(input: string, pocketRisu: string, malang: string): boolean {
    const withoutRel = (html: string) => html.replaceAll(' rel="noopener noreferrer"', '')
    return withoutRel(pocketRisu) === withoutRel(malang) || /<style\s[^>]*>/i.test(input)
}
