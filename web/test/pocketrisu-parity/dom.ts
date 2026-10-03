import { Window } from 'happy-dom'

// Also preloaded by bunfig.toml; imported here for runs outside the web workspace.
import '../happy-dom-node-name'

let installed: Window | undefined

/**
 * DOMPurify binds to `window` when its module is evaluated, so this must run
 * before the renderer modules are imported (they are loaded dynamically).
 */
export function installHappyDom(): Window {
    if (installed) return installed
    const window = new Window({ url: 'https://malang.test/' })
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
    installed = window
    return window
}
