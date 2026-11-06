import { readProducts } from '@/lib/api/reads'
import { listRoute } from '@/lib/api/route'

export const GET = listRoute(readProducts)
