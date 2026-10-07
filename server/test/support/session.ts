import type { createApp } from '@/app'

export async function login(app: ReturnType<typeof createApp>, password: string) {
    const response = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
    })
    if (response.status !== 200) throw new Error(`login failed with status ${response.status}`)
    return response.headers.get('set-cookie')!.split(';')[0]!
}
