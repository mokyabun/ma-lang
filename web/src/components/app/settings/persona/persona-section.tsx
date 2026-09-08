import type { AppSettings } from '@malang/shared'

import { SectionHeading } from '../../page-heading'
import { PersonaManager } from './persona-manager'

export function PersonaSection({
    onSettingsChange,
}: {
    onSettingsChange: (settings: AppSettings) => void
}) {
    return (
        <div className="h-full min-h-0 min-w-0 overflow-y-auto px-8 pb-16 pt-7 max-sm:px-4 max-sm:pt-5">
            <div className="w-full">
                <SectionHeading className="mb-6 pr-12 [&_h2]:text-2xl" title="페르소나" />
                <PersonaManager onSettingsChange={onSettingsChange} />
            </div>
        </div>
    )
}
