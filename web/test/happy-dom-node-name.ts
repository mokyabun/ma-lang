// Preloaded for every web test (bunfig.toml). Browsers define `nodeName` once,
// on Node.prototype. happy-dom overrides it on every subclass and leaves
// Node.prototype's getter returning "". DOMPurify 3.4+ caches Node.prototype's
// getter when an instance is created (a clobbering defence), so under happy-dom
// it reads every tag name as "" and strips allowed elements such as <p>.
// happy-dom shares its classes between Window instances, so patching once
// before any DOMPurify instance exists fixes every test file.
import { Node } from 'happy-dom'

const nodePrototype: object = Node.prototype

Object.defineProperty(nodePrototype, 'nodeName', {
    configurable: true,
    get(this: object): string {
        for (
            let prototype = Object.getPrototypeOf(this) as object | null;
            prototype && prototype !== nodePrototype;
            prototype = Object.getPrototypeOf(prototype) as object | null
        ) {
            if (Object.hasOwn(prototype, 'nodeName')) {
                return Reflect.get(prototype, 'nodeName', this) as string
            }
        }
        return ''
    },
})
