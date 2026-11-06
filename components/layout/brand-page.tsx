import { Logo } from './logo'

/** The page around anything outside the app (signing in, an invitation, an assistant's request): the name, the closing rule, then what it's for. */
export function BrandPage({ children, width = 'max-w-sm' }: { children: React.ReactNode; width?: string }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-surface px-4 py-10">
      <div className={`w-full ${width}`}>
        <Logo />
        <span aria-hidden className="rule-double mt-4 mb-6 text-primary" />
        {children}
      </div>
    </main>
  )
}
