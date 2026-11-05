import { describe, expect, it } from 'vitest'
import { readSchemaModels, tenantModels, TRUSTED_MODELS } from './schema'

const { trustedPrisma } = await import('@/lib/trusted-prisma')

type TableSecurity = { enabled: boolean; forced: boolean }
type Policy = { policyname: string; cmd: string; roles: string[]; qual: string | null; with_check: string | null }

const securityOf = async (table: string) => (await trustedPrisma.$queryRaw<TableSecurity[]>`SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class WHERE oid = to_regclass(${`"${table}"`})`)[0]
const policiesOf = (table: string) => trustedPrisma.$queryRaw<Policy[]>`SELECT policyname, cmd, roles::text[] AS roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = ${table}`

const tenants = tenantModels()
const OWN_WORKSPACE = /"workspaceId" = current_setting\('app\.workspace_id'::text, true\)/

describe('what a forgotten table would fail', () => {
  it('every model but the listed trusted ones holds a workspace, and the trusted ones hold none', () => {
    for (const model of tenants) expect(model.scalars.has('workspaceId'), `${model.name} has no workspaceId: add one, or list it as trusted`).toBe(true)
    for (const model of readSchemaModels().filter(({ name }) => TRUSTED_MODELS.includes(name) && name !== 'Member')) expect(model.scalars.has('workspaceId'), model.name).toBe(false)
  })

  it.each(tenants.map(({ name }) => name))('%s has row-level security enabled and forced', async (table) => {
    expect(await securityOf(table)).toEqual({ enabled: true, forced: true })
  })

  it.each(tenants.map(({ name }) => name))('%s has a policy for the app role checking both ways', async (table) => {
    const policy = (await policiesOf(table)).find(({ policyname }) => policyname === 'tenant_isolation')
    expect(policy, `${table} has no tenant_isolation policy`).toBeDefined()
    expect(policy!.cmd).toBe('ALL')
    expect(policy!.roles).toEqual(['soldlyne_app'])
    expect(policy!.qual).toMatch(OWN_WORKSPACE)
    expect(policy!.with_check).toMatch(OWN_WORKSPACE)
  })

  it.each(tenants.flatMap(({ name, links }) => links.filter(({ parent }) => parent !== 'Workspace' && !TRUSTED_MODELS.includes(parent)).map((link) => [name, link.column, link.parent])))('%s.%s is checked against %s by the policy: a foreign key alone would let it point at another workspace', async (table, column, parent) => {
    const policy = (await policiesOf(table)).find(({ policyname }) => policyname === 'tenant_isolation')
    expect(policy!.with_check).toContain(`FROM "${parent}" parent`)
    expect(policy!.with_check).toContain(`parent.id = "${table}"."${column}"`)
  })

  it.each(tenants.map(({ name }) => name))('%s fills its required workspace from the transaction, and goes when the workspace does', async (table) => {
    const [column] = await trustedPrisma.$queryRaw<{ is_nullable: string; column_default: string }[]>`SELECT is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'workspaceId'`
    expect(column).toEqual({ is_nullable: 'NO', column_default: "current_setting('app.workspace_id'::text)" })
    const [key] = await trustedPrisma.$queryRaw<{ action: string }[]>`SELECT confdeltype::text AS action FROM pg_constraint WHERE conrelid = to_regclass(${`"${table}"`}) AND contype = 'f' AND confrelid = '"Workspace"'::regclass`
    expect(key?.action).toBe('c')
  })

  it('the app role can bypass nothing, and has no grant on what lies outside a workspace', async () => {
    const [role] = await trustedPrisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }[]>`SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'soldlyne_app'`
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false, rolcanlogin: false })
    const models = readSchemaModels()
    const tableOf = (name: string) => ({ User: 'user', Session: 'session', Account: 'account', Verification: 'verification', RateLimit: 'rateLimit', OauthClient: 'oauth_client', OauthResource: 'oauth_resource', OauthClientResource: 'oauth_client_resource', OauthRefreshToken: 'oauth_refresh_token', OauthAccessToken: 'oauth_access_token', OauthConsent: 'oauth_consent', OauthClientAssertion: 'oauth_client_assertion', Jwks: 'jwks' })[name] ?? name
    for (const { name } of models.filter((model) => TRUSTED_MODELS.includes(model.name))) {
      const table = `"${tableOf(name)}"`
      const [grant] = await trustedPrisma.$queryRaw<{ can: boolean }[]>`SELECT has_table_privilege('soldlyne_app', to_regclass(${table}), 'SELECT, INSERT, UPDATE, DELETE') AS can`
      expect(grant.can, `${name} is granted to the app role`).toBe(false)
    }
  })

  it('leaves row-level security off on the two tables the trusted path reads to find a workspace', async () => {
    for (const table of ['Workspace', 'Member']) expect(await securityOf(table)).toEqual({ enabled: false, forced: false })
  })
})
