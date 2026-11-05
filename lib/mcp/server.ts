import 'server-only'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { withMcpActor } from '@/lib/actor'
import { boundWorkspaceId, runInWorkspace } from '@/lib/prisma'
import { publicUrl } from '@/lib/public-url'
import { ROLE_NAMES } from '@/lib/workspaces/roles'
import { workspaceNamed, workspacesOf, type MemberWorkspace } from '@/lib/workspaces/workspaces'
import { INSTRUCTIONS, registerTools, type PageLink } from './tools'

/** Only said to a member with several: for the others, nothing changes. */
const SEVERAL_WORKSPACES = `This member works for several companies, each its own workspace, with nothing shared between them. There is no current workspace: list_workspaces names them, and every other tool says which one it acts in through its workspace argument, on every call; a call without it is refused. Ids from one workspace mean nothing in another.`

const WORKSPACE_ARGUMENT = z.string().optional().describe("Which of this member's workspaces this call acts in: its id, or its exact name, from list_workspaces. There is no current workspace, so a call without it is refused. If you're unsure which one is meant, ask the member.")

/** The same words whether the workspace was left out, unknown or someone else's: a refusal never says that a workspace exists. */
const whichWorkspace = (workspaces: MemberWorkspace[]) => `Which workspace? This member belongs to: ${workspaces.map(({ name }) => JSON.stringify(name)).join(', ')}. Ask them which one this is for, then call again with its exact name or id in the workspace argument.`

const refusal = (message: string) => ({ isError: true, content: [{ type: 'text' as const, text: message }] })

/**
 * What a tool takes, the workspace included. With one workspace there's nothing to choose, so the
 * argument isn't offered; it's still read, so that an assistant still naming a workspace its member
 * has left is refused rather than quietly served by the one they have.
 */
function acceptingWorkspace(schema: z.ZodObject, offered: boolean) {
  const accepting = schema.extend({ workspace: WORKSPACE_ARGUMENT })
  return offered ? accepting : { '~standard': { ...accepting['~standard'], jsonSchema: schema['~standard'].jsonSchema } }
}

type Asker = { userId: string; clientId: string; workspaces: MemberWorkspace[] }

type ToolConfig = { inputSchema: z.ZodObject } & Record<string, unknown>
type ToolHandler = (args: Record<string, unknown>, context: unknown) => unknown

/**
 * The one place every tool gets its workspace: a server that registers each on the real one, taking
 * the workspace on the call and checking it against what the member belongs to right now. A hidden
 * current workspace could write to the wrong company, so nothing is bound before this.
 */
function workspaceAwareServer(server: McpServer, { userId, clientId, workspaces }: Asker) {
  const several = workspaces.length > 1
  return {
    registerTool(name: string, config: ToolConfig, handler: ToolHandler) {
      const wrapped = async ({ workspace, ...args }: { workspace?: string }, context: unknown) => {
        const belongsTo = await workspacesOf(userId)
        const chosen = workspaceNamed(belongsTo, workspace)
        if (!chosen) return refusal(whichWorkspace(belongsTo))
        return runInWorkspace(chosen.id, () => withMcpActor(clientId, async () => handler(args, context)))
      }
      return (server.registerTool as unknown as (...parts: unknown[]) => unknown)(name, { ...config, inputSchema: acceptingWorkspace(config.inputSchema, several) }, wrapped)
    },
  } as unknown as Pick<McpServer, 'registerTool'>
}

/** The one tool that isn't in a workspace: it says which there are. It only reads, and offers no way to change who belongs where. */
function registerWorkspaceList(server: McpServer, userId: string) {
  server.registerTool(
    'list_workspaces',
    {
      title: "This member's workspaces",
      description: 'The workspaces this member belongs to, one per company, with their role in each. With several, every other tool says which one it acts in through its workspace argument.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const workspaces = (await workspacesOf(userId)).map(({ id, name, role }) => ({ id, name, role: ROLE_NAMES[role].toLowerCase() }))
      return { content: [{ type: 'text', text: JSON.stringify({ workspaces }, null, 2) }] }
    },
  )
}

/**
 * With several workspaces, a page goes through the workspace the call was in: the screens follow the
 * browser's workspace, which may be another, and the record wouldn't be found there.
 */
const pageLink = (several: boolean): PageLink => (path) => (several ? `${publicUrl()}/workspace/${boundWorkspaceId()}?${new URLSearchParams({ next: path })}` : `${publicUrl()}${path}`)

/** The MCP server for one request. Who belongs where is read again on each call. */
export function soldlyneServer(asker: Asker): McpServer {
  const several = asker.workspaces.length > 1
  const server = new McpServer({ name: 'soldlyne', title: 'Soldlyne', version: '0.1.0' }, { instructions: several ? `${INSTRUCTIONS}\n\n${SEVERAL_WORKSPACES}` : INSTRUCTIONS })
  registerWorkspaceList(server, asker.userId)
  registerTools(workspaceAwareServer(server, asker), pageLink(several))
  return server
}
