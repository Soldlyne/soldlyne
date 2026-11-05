import { readFileSync } from 'node:fs'

/** The models Prisma's schema declares, read from the file itself: a new one is covered the moment it's added. */
export type SchemaModel = { name: string; scalars: Map<string, { optional: boolean }>; links: { column: string; parent: string }[] }

export function readSchemaModels(): SchemaModel[] {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8')
  return [...schema.matchAll(/^model (\w+) \{\n([\s\S]*?)^\}/gm)].map(([, name, body]) => {
    const lines = body.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
    const scalars = new Map<string, { optional: boolean }>()
    const links: SchemaModel['links'] = []
    for (const line of lines) {
      const [field, type] = line.split(/\s+/)
      const relation = line.match(/@relation\(.*fields: \[(\w+)\]/)
      if (relation) links.push({ column: relation[1], parent: type.replace('?', '') })
      else if (!line.includes('@relation') && /^[A-Z]/.test(type) && !/\[\]$/.test(type)) scalars.set(field, { optional: type.endsWith('?') })
    }
    return { name, scalars, links }
  })
}

/** Everything outside any workspace: sign-in's own tables, and those that say who belongs where. */
export const TRUSTED_MODELS = ['User', 'Session', 'Account', 'Verification', 'RateLimit', 'OauthClient', 'OauthResource', 'OauthClientResource', 'OauthRefreshToken', 'OauthAccessToken', 'OauthConsent', 'OauthClientAssertion', 'Jwks', 'Workspace', 'Member']

export const tenantModels = () => readSchemaModels().filter(({ name }) => !TRUSTED_MODELS.includes(name))
