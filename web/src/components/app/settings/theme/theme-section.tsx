import { ArrowCounterClockwise, Moon, SlidersHorizontal, Sun } from '@phosphor-icons/react'

import { CHAT_APPEARANCE_DEFAULTS, CHAT_APPEARANCE_LIMITS } from '@/components/theme-preferences'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

import { SectionHeading } from '../../page-heading'
import { SettingTitle } from '../shared/setting-title'
import { RangeSetting } from './range-setting'
import { ThemeChoice } from './theme-choice'
import { ThemePreview } from './theme-preview'

export function ThemeSection() {
    const {
        theme,
        setTheme,
        chatFontSize,
        setChatFontSize,
        chatMaxWidth,
        setChatMaxWidth,
        quickSettingsButton,
        setQuickSettingsButton,
        resetChatAppearance,
    } = useTheme()

    return (
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
            <div className="w-full">
                <SectionHeading className="mb-7 pr-12 [&_h2]:text-2xl" title="테마" />

                <section className="border-y border-border py-5">
                    <SettingTitle
                        title="화면 명암"
                        description="앱 전체에 사용할 배경과 전경 대비를 선택합니다."
                    />
                    <div className="mt-4 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                        <ThemeChoice
                            active={theme === 'dark'}
                            icon={Moon}
                            label="다크"
                            description="긴 이야기에 집중하는 낮은 조도"
                            swatches={['#171722', '#222231', '#d9d8ee']}
                            onClick={() => setTheme('dark')}
                        />
                        <ThemeChoice
                            active={theme === 'light'}
                            icon={Sun}
                            label="라이트"
                            description="밝은 환경을 위한 선명한 대비"
                            swatches={['#f3f4f6', '#ffffff', '#4d4b63']}
                            onClick={() => setTheme('light')}
                        />
                    </div>
                </section>

                <section className="py-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <SettingTitle
                            title="채팅 읽기 영역"
                            description="메시지 본문의 글자 크기와 카드가 펼쳐지는 최대 폭을 조절합니다."
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            onClick={resetChatAppearance}
                            disabled={
                                chatFontSize === CHAT_APPEARANCE_DEFAULTS.fontSize &&
                                chatMaxWidth === CHAT_APPEARANCE_DEFAULTS.maxWidth
                            }
                        >
                            <ArrowCounterClockwise aria-hidden="true" /> 기본값
                        </Button>
                    </div>

                    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(20rem,1.2fr)]">
                        <div className="grid content-start gap-6 border border-border bg-card/35 p-5">
                            <RangeSetting
                                id="chat-font-size"
                                label="본문 글자 크기"
                                value={chatFontSize}
                                min={CHAT_APPEARANCE_LIMITS.fontSize.min}
                                max={CHAT_APPEARANCE_LIMITS.fontSize.max}
                                step={CHAT_APPEARANCE_LIMITS.fontSize.step}
                                valueLabel={`${chatFontSize}px`}
                                edgeLabels={['작게', '크게']}
                                onChange={setChatFontSize}
                            />
                            <div className="h-px bg-border" />
                            <RangeSetting
                                id="chat-max-width"
                                label="좌우 최대 폭"
                                value={chatMaxWidth}
                                min={CHAT_APPEARANCE_LIMITS.maxWidth.min}
                                max={CHAT_APPEARANCE_LIMITS.maxWidth.max}
                                step={CHAT_APPEARANCE_LIMITS.maxWidth.step}
                                valueLabel={`${chatMaxWidth}px`}
                                edgeLabels={['집중', '넓게']}
                                onChange={setChatMaxWidth}
                            />
                            <p className="border-l border-primary pl-3 text-[11px] leading-5 text-muted-foreground">
                                화면이 선택한 폭보다 좁으면 카드가 화면에 맞게 자동으로 줄어듭니다.
                            </p>
                        </div>

                        <ThemePreview fontSize={chatFontSize} maxWidth={chatMaxWidth} />
                    </div>
                </section>

                <section className="border-t border-border py-6">
                    <div className="flex items-center justify-between gap-5 border border-border bg-card/35 p-4">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="grid size-9 shrink-0 place-items-center border border-border bg-background text-muted-foreground">
                                <SlidersHorizontal aria-hidden="true" />
                            </span>
                            <div>
                                <h3 className="text-sm font-semibold">빠른 채팅 설정 버튼</h3>
                                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                    채팅 화면에 이동할 수 있는 설정 버튼을 표시합니다. 위치는 이
                                    브라우저에 저장됩니다.
                                </p>
                            </div>
                        </div>
                        <Switch
                            checked={quickSettingsButton}
                            onCheckedChange={setQuickSettingsButton}
                            aria-label="빠른 채팅 설정 버튼 표시"
                        />
                    </div>
                </section>
            </div>
        </div>
    )
}
