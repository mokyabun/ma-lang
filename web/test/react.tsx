import { afterEach, beforeEach } from 'bun:test'

import { Window } from 'happy-dom'
import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'

export function hookHarness<T>(onRender: (value: T) => void) {
    const globals = ['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'] as const
    let previous: Array<PropertyDescriptor | undefined>
    let window: Window
    let root: Root

    beforeEach(() => {
        previous = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
        window = new Window({ url: 'https://malang.test/' })
        Object.assign(globalThis, {
            window,
            document: window.document,
            IS_REACT_ACT_ENVIRONMENT: true,
        })
        const container = document.createElement('div')
        document.body.append(container)
        root = createRoot(container)
    })

    afterEach(async () => {
        try {
            await act(async () => root.unmount())
        } finally {
            window.close()
            globals.forEach((key, index) => {
                const descriptor = previous[index]
                if (descriptor) Object.defineProperty(globalThis, key, descriptor)
                else Reflect.deleteProperty(globalThis, key)
            })
        }
    })

    return {
        async mount(useHook: () => T) {
            function Harness() {
                const value = useHook()
                useLayoutEffect(() => onRender(value))
                return null
            }
            await act(async () => root.render(<Harness />))
        },
    }
}
