import { describe, expect, test } from 'bun:test'

import { statusLabel } from '@/features/chat/format'

describe('message status labels', () => {
    test('name every message status', () => {
        expect(statusLabel('streaming')).toBe('작성 중')
        expect(statusLabel('cancelled')).toBe('중단됨')
        expect(statusLabel('failed')).toBe('실패')
        expect(statusLabel('complete')).toBe('완료')
    })
})
