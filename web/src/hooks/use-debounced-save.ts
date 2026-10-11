import { useSetAtom } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'

import { autoSaveReportsAtom, type AutoSaveReport, type AutoSaveState } from '@/lib/auto-save-state'

export function useDebouncedSave<T>(
    value: T,
    onSave: (value: T) => Promise<void>,
    options: { delay?: number; enabled?: boolean } = {},
) {
    const delay = options.delay ?? 700
    const enabled = options.enabled ?? true
    const [state, setState] = useState<AutoSaveState>('idle')
    const [error, setError] = useState('')
    const [reportId] = useState(() => crypto.randomUUID())
    const setReports = useSetAtom(autoSaveReportsAtom)
    const saveRef = useRef(onSave)
    const latestRef = useRef(value)
    const enabledRef = useRef(enabled)
    const savedSnapshotRef = useRef(JSON.stringify(value))
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const inFlightSnapshotRef = useRef<string | null>(null)
    const requestRef = useRef(0)
    const mountedRef = useRef(true)
    const reportRef = useRef<AutoSaveReport>({ state: 'idle', error: '', updatedAt: 0 })
    const reportRemovalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        saveRef.current = onSave
        latestRef.current = value
        enabledRef.current = enabled
    }, [enabled, onSave, value])

    useEffect(() => {
        const report = { state, error, updatedAt: Date.now() }
        reportRef.current = report
        setReports((current) => ({
            ...current,
            [reportId]: report,
        }))
    }, [error, reportId, setReports, state])

    useEffect(() => {
        if (reportRemovalTimerRef.current) {
            clearTimeout(reportRemovalTimerRef.current)
            reportRemovalTimerRef.current = null
        }

        return () => {
            const removeReport = () => {
                setReports((current) => {
                    const next = { ...current }
                    delete next[reportId]
                    return next
                })
            }
            const lastState = reportRef.current.state
            if (lastState === 'saved' || lastState === 'error') {
                reportRemovalTimerRef.current = setTimeout(removeReport, 2500)
                return
            }
            removeReport()
        }
    }, [reportId, setReports])

    const saveSnapshot = useCallback(async (next: T, snapshot: string) => {
        if (inFlightSnapshotRef.current === snapshot) return
        inFlightSnapshotRef.current = snapshot
        const request = ++requestRef.current
        if (mountedRef.current) {
            setState('saving')
            setError('')
        }
        try {
            await saveRef.current(next)
            if (!mountedRef.current || request !== requestRef.current) return
            savedSnapshotRef.current = snapshot
            setState(JSON.stringify(latestRef.current) === snapshot ? 'saved' : 'pending')
        } catch (cause) {
            if (!mountedRef.current || request !== requestRef.current) return
            setError(cause instanceof Error ? cause.message : '자동 저장하지 못했습니다.')
            setState('error')
        } finally {
            if (inFlightSnapshotRef.current === snapshot) inFlightSnapshotRef.current = null
        }
    }, [])

    const flush = useCallback(async () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        if (!enabledRef.current) return
        const next = latestRef.current
        const snapshot = JSON.stringify(next)
        if (snapshot === savedSnapshotRef.current || snapshot === inFlightSnapshotRef.current) {
            return
        }
        await saveSnapshot(next, snapshot)
    }, [saveSnapshot])

    const saveNow = useCallback(
        async (next: T) => {
            if (timerRef.current) {
                clearTimeout(timerRef.current)
                timerRef.current = null
            }
            latestRef.current = next
            if (!enabledRef.current) return
            const snapshot = JSON.stringify(next)
            if (snapshot === savedSnapshotRef.current || snapshot === inFlightSnapshotRef.current)
                return
            await saveSnapshot(next, snapshot)
        },
        [saveSnapshot],
    )

    const reset = useCallback((next: T) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
        }
        requestRef.current += 1
        latestRef.current = next
        savedSnapshotRef.current = JSON.stringify(next)
        setError('')
        setState('idle')
    }, [])

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current)
        const snapshot = JSON.stringify(value)
        if (!enabled) {
            if (snapshot !== savedSnapshotRef.current) setState('pending')
            return
        }
        if (snapshot === savedSnapshotRef.current) return

        setState('pending')
        setError('')
        timerRef.current = setTimeout(() => {
            timerRef.current = null
            void saveSnapshot(value, snapshot)
        }, delay)

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current)
                timerRef.current = null
            }
        }
    }, [delay, enabled, saveSnapshot, value])

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            if (timerRef.current) clearTimeout(timerRef.current)
            const next = latestRef.current
            const snapshot = JSON.stringify(next)
            if (
                enabledRef.current &&
                snapshot !== savedSnapshotRef.current &&
                snapshot !== inFlightSnapshotRef.current
            ) {
                void saveRef.current(next)
            }
        }
    }, [])

    return { state, error, flush, saveNow, reset }
}
