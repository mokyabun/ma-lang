import { SlidersHorizontal } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const POSITION_STORAGE_KEY = 'malang-quick-settings-position'
const EDGE_GAP = 16
const BUTTON_SIZE = 48
const DRAG_THRESHOLD = 4

export interface RelativePosition {
    x: number
    y: number
}

const DEFAULT_POSITION: RelativePosition = { x: 0.96, y: 0.82 }

export function QuickChatSettingsButton({ onOpen }: { onOpen: () => void }) {
    const [position, setPosition] = useState(readStoredPosition)
    const [viewport, setViewport] = useState(readViewport)
    const [dragging, setDragging] = useState(false)
    const positionRef = useRef(position)
    const suppressClick = useRef(false)
    const drag = useRef<{
        pointerId: number
        originX: number
        originY: number
        originLeft: number
        originTop: number
        moved: boolean
    } | null>(null)
    const bounds = useMemo(() => movementBounds(viewport.width, viewport.height), [viewport])
    const boundsRef = useRef(bounds)

    useEffect(() => {
        positionRef.current = position
    }, [position])

    useEffect(() => {
        boundsRef.current = bounds
    }, [bounds])

    useEffect(() => {
        const updateViewport = () => setViewport(readViewport())
        const move = (event: PointerEvent) => {
            const current = drag.current
            if (!current || current.pointerId !== event.pointerId) return
            const deltaX = event.clientX - current.originX
            const deltaY = event.clientY - current.originY
            if (!current.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return
            current.moved = true
            setDragging(true)
            const currentBounds = boundsRef.current
            const next = {
                x: currentBounds.width
                    ? clamp((current.originLeft + deltaX - EDGE_GAP) / currentBounds.width)
                    : 0,
                y: currentBounds.height
                    ? clamp((current.originTop + deltaY - EDGE_GAP) / currentBounds.height)
                    : 0,
            }
            positionRef.current = next
            setPosition(next)
        }
        const finish = (event: PointerEvent) => {
            const current = drag.current
            if (!current || current.pointerId !== event.pointerId) return
            suppressClick.current = current.moved
            if (current.moved) writeStoredPosition(positionRef.current)
            drag.current = null
            setDragging(false)
        }
        window.addEventListener('resize', updateViewport)
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', finish)
        window.addEventListener('pointercancel', finish)
        return () => {
            window.removeEventListener('resize', updateViewport)
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', finish)
            window.removeEventListener('pointercancel', finish)
        }
    }, [])

    const left = EDGE_GAP + position.x * bounds.width
    const top = EDGE_GAP + position.y * bounds.height

    return (
        <Button
            type="button"
            size="icon"
            className={cn(
                'fixed z-40 size-12 touch-none rounded-full border border-primary/35 bg-primary text-primary-foreground shadow-lg shadow-black/20 transition-[box-shadow,transform] hover:bg-primary hover:shadow-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95',
                dragging && 'cursor-grabbing scale-105 shadow-xl',
            )}
            style={{ left, top }}
            aria-label="빠른 채팅 설정 열기. 드래그하여 위치 이동"
            title="빠른 채팅 설정"
            onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                suppressClick.current = false
                drag.current = {
                    pointerId: event.pointerId,
                    originX: event.clientX,
                    originY: event.clientY,
                    originLeft: left,
                    originTop: top,
                    moved: false,
                }
            }}
            onClick={(event) => {
                if (suppressClick.current) {
                    event.preventDefault()
                    suppressClick.current = false
                    return
                }
                onOpen()
            }}
        >
            <SlidersHorizontal className="size-5" aria-hidden="true" />
        </Button>
    )
}

export function normalizePosition(value: unknown): RelativePosition {
    if (!value || typeof value !== 'object') return DEFAULT_POSITION
    const candidate = value as Partial<RelativePosition>
    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return DEFAULT_POSITION
    return { x: clamp(candidate.x!), y: clamp(candidate.y!) }
}

function readStoredPosition(): RelativePosition {
    if (typeof window === 'undefined') return DEFAULT_POSITION
    try {
        return normalizePosition(
            JSON.parse(window.localStorage.getItem(POSITION_STORAGE_KEY) || ''),
        )
    } catch {
        return DEFAULT_POSITION
    }
}

function writeStoredPosition(position: RelativePosition) {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position))
}

function readViewport() {
    if (typeof window === 'undefined') return { width: 0, height: 0 }
    return { width: window.innerWidth, height: window.innerHeight }
}

function movementBounds(viewportWidth: number, viewportHeight: number) {
    return {
        width: Math.max(0, viewportWidth - EDGE_GAP * 2 - BUTTON_SIZE),
        height: Math.max(0, viewportHeight - EDGE_GAP * 2 - BUTTON_SIZE),
    }
}

function clamp(value: number) {
    return Math.min(1, Math.max(0, value))
}
