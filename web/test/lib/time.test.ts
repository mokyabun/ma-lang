import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import { relativeTime } from '@/lib/time'

afterEach(() => {
    setSystemTime()
})

describe('relative time', () => {
    test('rounds down to minutes, hours and days', () => {
        setSystemTime(new Date('2026-10-11T12:00:00.000Z'))
        expect(relativeTime('2026-10-11T11:59:30.000Z')).toBe('방금 전')
        expect(relativeTime('2026-10-11T11:01:00.000Z')).toBe('59분 전')
        expect(relativeTime('2026-10-11T11:00:00.000Z')).toBe('1시간 전')
        expect(relativeTime('2026-10-10T12:00:01.000Z')).toBe('23시간 전')
        expect(relativeTime('2026-10-08T12:00:00.000Z')).toBe('3일 전')
    })
})
