import { useAtom } from 'jotai'

import { confirmationAtom } from './atom'
import { ConfirmDialog } from './confirm-dialog'

export function WorkspaceDialogs() {
    const [confirmation, setConfirmation] = useAtom(confirmationAtom)

    return (
        <ConfirmDialog
            open={Boolean(confirmation)}
            title={confirmation?.title ?? ''}
            description={confirmation?.description ?? ''}
            confirmLabel={confirmation?.confirmLabel}
            onOpenChange={(open) => !open && setConfirmation(null)}
            onConfirm={() => confirmation?.action()}
        />
    )
}
