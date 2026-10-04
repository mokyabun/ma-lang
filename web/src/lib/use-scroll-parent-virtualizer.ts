import { useVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef, useState } from 'react'

type ScrollParentVirtualizerOptions = {
    count: number
    estimateSize: (index: number) => number
    getItemKey?: (index: number) => string | number
    overscan?: number
}

/**
 * Virtualizes a list rendered inside an existing scroll container (the nearest
 * scrollable ancestor) instead of requiring its own fixed-height viewport.
 * Rendered rows should be absolutely positioned at `start - virtualizer.options.scrollMargin`.
 */
export function useScrollParentVirtualizer<T extends HTMLElement>({
    count,
    estimateSize,
    getItemKey,
    overscan = 6,
}: ScrollParentVirtualizerOptions) {
    const listRef = useRef<T>(null)
    const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
    const [scrollMargin, setScrollMargin] = useState(0)
    const hasItems = count > 0

    useLayoutEffect(() => {
        const list = listRef.current
        if (!list) return
        const parent = findScrollParent(list)
        const isDocument = parent === document.scrollingElement
        const scrollTarget: HTMLElement | Window = isDocument ? window : parent
        setScrollElement(parent)

        // The list's offset inside the scroller is invariant under scrolling, but content above it
        // can grow or shrink, so re-measure on scroll and resize.
        const measure = () => {
            const next =
                list.getBoundingClientRect().top -
                (isDocument ? 0 : parent.getBoundingClientRect().top) +
                parent.scrollTop
            setScrollMargin((current) => (Math.abs(current - next) < 1 ? current : next))
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(parent)
        if (parent.firstElementChild) observer.observe(parent.firstElementChild)
        scrollTarget.addEventListener('scroll', measure, { passive: true })
        return () => {
            observer.disconnect()
            scrollTarget.removeEventListener('scroll', measure)
        }
        // The list element is usually only rendered while there is something to list.
    }, [hasItems])

    // TanStack Virtual intentionally exposes an imperative instance that React Compiler skips.
    // oxlint-disable-next-line react/incompatible-library
    const virtualizer = useVirtualizer({
        count,
        getScrollElement: () => scrollElement,
        estimateSize,
        getItemKey,
        overscan,
        scrollMargin,
        measureElement: (element) => element.getBoundingClientRect().height,
    })

    return { listRef, virtualizer }
}

function findScrollParent(element: HTMLElement): HTMLElement {
    let current = element.parentElement
    while (current) {
        const { overflowY } = getComputedStyle(current)
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
            return current
        current = current.parentElement
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}
