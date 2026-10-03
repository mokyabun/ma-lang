// PocketRisu installs this helper on globalThis during app bootstrap. Unlike
// PocketRisu's own vitest.setup.ts, katex is deliberately left unmocked so
// `$$…$$` math renders exactly as it does in the app.
globalThis.safeStructuredClone = (value: unknown) => structuredClone(value)
