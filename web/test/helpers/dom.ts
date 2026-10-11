import { Window } from 'happy-dom'

let installed: Window | undefined

/**
 * Installs one happy-dom window as the global DOM for the rest of the process. The message
 * renderer caches its DOMPurify instance on the first window it sees, so this one is never closed.
 */
export function installDom(): Window {
    const window = (installed ??= new Window({ url: 'https://malang.test/' }))
    Object.assign(globalThis, {
        window,
        document: window.document,
        Node: window.Node,
        NodeFilter: window.NodeFilter,
        Element: window.Element,
        HTMLElement: window.HTMLElement,
        HTMLAnchorElement: window.HTMLAnchorElement,
        HTMLIFrameElement: window.HTMLIFrameElement,
        DocumentFragment: window.DocumentFragment,
    })
    return window
}
