// Preloaded for every web test (bunfig.toml). Bun runs all test files in one process, so stubs
// are undone after each test here rather than in every file.
import { afterEach, mock } from 'bun:test'

import './happy-dom-node-name'

const originalFetch = globalThis.fetch

afterEach(() => {
    mock.restore()
    globalThis.fetch = originalFetch
})
