import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { signInOf } from '@/lib/sign-in'
import { ResetForm } from './reset-form'

export const metadata: Metadata = { title: 'New password' }

/** Where the link of a forgotten password leads. */
export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  // Read when the page is asked for: a build doesn't know the install.
  await connection()
  if (!signInOf(process.env).passwords) notFound()
  const { token } = await searchParams
  return (
    <main className="flex min-h-svh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">A new password</h1>
        {typeof token === 'string' ? (
          <ResetForm token={token} />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            This link has expired or was already used.{' '}
            <Link href="/login" className="text-link hover:underline">
              Ask for a new one
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  )
}
