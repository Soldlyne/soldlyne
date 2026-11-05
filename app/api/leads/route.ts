import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { captureLead, hashKey } from '@/lib/leads/capture'
import { runInWorkspace } from '@/lib/prisma'
import { trustedPrisma } from '@/lib/trusted-prisma'

/**
 * Lead capture for your sites. Call it from the site's server (never from the browser):
 *   POST /api/leads  Authorization: Bearer <lead source key>
 *   { "email": "...", "firstName": "...", "company": "...", "message": "...", "consent": true, "page": "/pricing" }
 */
export async function POST(request: Request) {
  const key = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  // Trusted: the key is what says which workspace this is, so it comes before any workspace is known.
  const source = key ? await trustedPrisma.leadSource.findUnique({ where: { keyHash: hashKey(key) }, select: { id: true, workspaceId: true } }) : null
  if (!source) return NextResponse.json({ error: 'Unknown lead source key' }, { status: 401 })
  try {
    const lead = await request.json()
    const result = await runInWorkspace(source.workspaceId, () => captureLead(source.id, lead))
    return NextResponse.json({ ok: true, ...result }, { status: result.created ? 201 : 200 })
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Invalid lead', issues: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, { status: 400 })
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    throw error
  }
}
