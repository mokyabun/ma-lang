import { Outlet, createRootRoute } from '@tanstack/react-router'

import { GlobalAutoSaveStatus } from '@/components/auto-save-status'
import { ThemeProvider } from '@/components/theme-provider'

import '@/styles.css'

export const Route = createRootRoute({
    component: RootComponent,
})

function RootComponent() {
    return (
        <ThemeProvider>
            <Outlet />
            <GlobalAutoSaveStatus />
        </ThemeProvider>
    )
}
