/** The site's public address, for links shown in the UI and returned to MCP clients. */
export function publicUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? 'http://localhost:3100').replace(/\/$/, '')
}
