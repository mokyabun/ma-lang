import { SettingsContent } from './settings-content'
import { SettingsControls } from './settings-controls'
import { SettingsNavigation } from './settings-navigation'
import type { SettingsPanelProps } from './types'

export function SettingsPanel(props: SettingsPanelProps) {
    return (
        <main className="h-dvh min-h-0 min-w-0 bg-muted/40">
            <div className="mx-auto grid h-full w-full max-w-[74rem] grid-cols-[13.5rem_minmax(0,1fr)] overflow-hidden border-x border-sidebar-border/70 bg-background shadow-2xl max-[720px]:grid-cols-1 max-[720px]:grid-rows-[4.25rem_minmax(0,1fr)] max-[720px]:border-x-0">
                <SettingsNavigation
                    section={props.section}
                    onSectionChange={props.onSectionChange}
                />
                <section className="relative min-h-0 min-w-0 bg-background">
                    <SettingsControls onBack={props.onBack} />
                    <SettingsContent {...props} />
                </section>
            </div>
        </main>
    )
}
