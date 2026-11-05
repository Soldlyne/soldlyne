import { NextResponse } from 'next/server'
import { anyMailboxConnected, syncEveryWorkspace } from '@/lib/sync/workspaces'

// Vercel Cron (vercel.json), every hour. Vercel sends CRON_SECRET as a bearer token.
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Nothing to read anywhere: stop here, without waking the database.
  if (!(await anyMailboxConnected())) return NextResponse.json({ idle: true })
  return NextResponse.json(await syncEveryWorkspace())
}
