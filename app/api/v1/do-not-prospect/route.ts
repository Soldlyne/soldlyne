import { readDoNotProspect } from '@/lib/api/do-not-prospect'
import { HANDOVER_SCOPE } from '@/lib/api/keys'
import { listRoute } from '@/lib/api/route'

export const GET = listRoute(readDoNotProspect, HANDOVER_SCOPE)
