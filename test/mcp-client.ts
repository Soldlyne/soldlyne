import { createMcpHandler } from '@modelcontextprotocol/server'

const { soldlyneServer } = await import('@/lib/mcp/server')
const { workspacesOf } = await import('@/lib/workspaces/workspaces')

/** Speaks to the MCP server over HTTP, as an assistant does: one JSON-RPC exchange per request, a fresh server each. */
export function mcpClient(origin: string) {
  function clientFor(userId: string) {
    return async function call(method: string, params: Record<string, unknown> = {}) {
      const workspaces = await workspacesOf(userId)
      const handler = createMcpHandler(() => soldlyneServer({ userId, clientId: 'test-client', workspaces }))
      const response = await handler.fetch(
        new Request(`${origin}/api/mcp`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        }),
      )
      const text = await response.text()
      const json = text.startsWith('{') ? text : (text.split('\n').find((line) => line.startsWith('data: ')) ?? '').slice(6)
      return JSON.parse(json).result
    }
  }
  const tool = (userId: string, name: string, args: Record<string, unknown> = {}) => clientFor(userId)('tools/call', { name, arguments: args })
  const parsed = (result: { content: { text: string }[] }) => JSON.parse(result.content[0].text)
  return { clientFor, tool, parsed }
}
