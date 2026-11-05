import { auth } from '@/lib/auth'

const handle = (request: Request) => auth().handler(request)

export const GET = handle
export const POST = handle
