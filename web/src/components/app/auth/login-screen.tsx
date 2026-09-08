import { ArrowRight, Key, WarningCircle } from '@phosphor-icons/react'
import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

interface LoginScreenProps {
    onAuthenticated: () => void
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setError('')
        setSubmitting(true)
        try {
            await api.login(password)
            onAuthenticated()
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '로그인하지 못했습니다.')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <main className="relative grid min-h-full place-items-center overflow-hidden bg-background p-6 sm:p-8">
            <section
                className="relative w-full max-w-md border border-border bg-card p-8 shadow-2xl sm:p-12 [&_h1]:font-serif [&_h1]:text-3xl [&_h1]:leading-tight"
                aria-labelledby="login-title"
            >
                <h1 id="login-title">다시 이야기를 시작하세요.</h1>

                <form onSubmit={handleSubmit} className="mt-7 grid gap-5">
                    <Label htmlFor="admin-password">관리자 비밀번호</Label>
                    <div className="grid gap-2">
                        <Key aria-hidden="true" weight="duotone" />
                        <Input
                            id="admin-password"
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="current-password"
                            placeholder="비밀번호 입력"
                            required
                        />
                    </div>
                    {error ? (
                        <p className="m-0 text-xs leading-5 text-destructive" role="alert">
                            <WarningCircle aria-hidden="true" />
                            {error}
                        </p>
                    ) : null}
                    <Button
                        size="lg"
                        variant="default"
                        type="submit"
                        className="gap-2 mt-1 w-full"
                        disabled={submitting}
                    >
                        {submitting ? '확인 중…' : '열기'}
                        <ArrowRight aria-hidden="true" />
                    </Button>
                </form>
            </section>
        </main>
    )
}
