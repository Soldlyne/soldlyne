import { readDeals } from '@/lib/api/reads'
import { listRoute } from '@/lib/api/route'

export const GET = listRoute(readDeals)
