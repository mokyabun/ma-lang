import { createFileRoute, redirect } from '@tanstack/react-router'

import { LoginScreen } from '@/features/auth/login-screen'
import { api } from '@/lib/api'

export const Route = createFileRoute('/login')({
    beforeLoad: async () => {
        try {
            await api.session()
        } catch {
            return
        }
        throw redirect({ to: '/characters' })
    },
    component: LoginPage,
})

function LoginPage() {
    const navigate = Route.useNavigate()
    return <LoginScreen onAuthenticated={() => void navigate({ to: '/characters' })} />
}
