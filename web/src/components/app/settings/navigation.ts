import {
    BracketsCurly,
    HardDrives,
    Palette,
    PuzzlePiece,
    Robot,
    FlowArrow,
    ImageSquare,
    PaintBrush,
    UserCircle,
} from '@phosphor-icons/react'

import type { SettingsSection } from './types'

export const SETTINGS_NAV: Array<{
    section: SettingsSection
    label: string
    icon: typeof UserCircle
}> = [
    {
        section: 'theme',
        label: '테마',
        icon: Palette,
    },
    {
        section: 'provider',
        label: '모델 프리셋',
        icon: Robot,
    },
    {
        section: 'chains',
        label: '모델 체이닝',
        icon: FlowArrow,
    },
    {
        section: 'persona',
        label: '페르소나',
        icon: UserCircle,
    },
    {
        section: 'prompts',
        label: '프롬프트 프리셋',
        icon: BracketsCurly,
    },
    { section: 'modules', label: '모듈', icon: PuzzlePiece },
    { section: 'illustration', label: '삽화', icon: ImageSquare },
    { section: 'illustration-styles', label: '삽화 스타일', icon: PaintBrush },
    { section: 'system', label: '시스템', icon: HardDrives },
]
