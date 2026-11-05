import { Panel } from '@/components/crm/record-layout'
import { listApiKeys } from '@/lib/api/keys'
import { publicUrl } from '@/lib/public-url'
import { ApiKeyControls } from './api-key-controls'

/** The keys other apps read this workspace with. Shown to owners and admins, who alone can make or end one. */
export async function ApiKeysSection() {
  const keys = await listApiKeys()
  return (
    <Panel title="API keys">
      <p className="mb-3 text-sm text-muted-foreground">
        Let another app read this workspace&apos;s deals, companies, stages and products, and nothing else: <span className="font-mono text-xs">{publicUrl()}/api/v1</span>. A key is shown once, and read-only. Only people make keys, here: no assistant can.
      </p>
      <ApiKeyControls keys={keys} />
    </Panel>
  )
}
