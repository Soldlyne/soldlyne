import type { Fields } from '@/lib/secrets'

export type ConnectorField = {
  key: string
  label: string
  /** Sealed with the rest of the credentials, and never shown again once saved, not even in part. */
  secret: boolean
  placeholder?: string
  help?: string
}

/** A step of setting a connector up at its service, with the address to copy when it needs one. */
export type SetupStep = { text: string; address?: string }

/**
 * What a service made of the credentials, in Soldlyne's own words: what a service answers can carry
 * anything, and this reaches a screen and an assistant's conversation. `unreachable` means no answer
 * either way, which says nothing about the credentials.
 */
export type CheckAnswer = { ok: true; note?: string } | { ok: false; reason: string; unreachable?: boolean }

/**
 * One service a workspace can connect. The table, the page, the checks and the assistant's tools all
 * work from this, so a new service is one of these, in a file of ./kinds, and its name in the registry.
 */
export type ConnectorDefinition = {
  kind: string
  name: string
  /** What it's for, on its card and to an assistant. */
  summary: string
  /** What it will never be used for, when that needs saying. */
  rule?: string
  fields: readonly ConnectorField[]
  /** How to get what the fields ask for. */
  setup: (publicAddress: string) => SetupStep[]
  /** Really tries the credentials, without writing to anybody. */
  check: (fields: Fields) => Promise<CheckAnswer>
  /** What disconnecting does, to say before it happens. Read in the workspace it's for. */
  whatStops: () => Promise<string>
}
