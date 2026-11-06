import 'server-only'
import { google } from './kinds/google'
import { resend } from './kinds/resend'
import type { ConnectorDefinition } from './types'

/** Every service a workspace can connect. A new one is a file in ./kinds and its name here: nothing else needs to know. */
export const CONNECTORS: readonly ConnectorDefinition[] = [google, resend]

export const connectorOf = (kind: string) => CONNECTORS.find((connector) => connector.kind === kind)
