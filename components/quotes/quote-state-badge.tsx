import { Badge } from '@/components/ui/badge'
import { STATE_LABELS, type QuoteState } from '@/lib/quotes/status'

const VARIANTS = { DRAFT: 'muted', SENT: 'info', ACCEPTED: 'success', DECLINED: 'destructive', EXPIRED: 'warning' } as const

export const QuoteStateBadge = ({ state }: { state: QuoteState }) => <Badge variant={VARIANTS[state]}>{STATE_LABELS[state]}</Badge>
