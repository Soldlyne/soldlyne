/**
 * What the round trip through Google carries: a random check against the cookie, and the workspace
 * the mailbox is for. It travels rather than being read again at the end, since the browser may have
 * switched workspace in another tab meanwhile, and a mailbox must land where it was asked for.
 */
export const newOAuthState = (random: string, workspaceId: string) => `${random}.${workspaceId}`

export const workspaceOfOAuthState = (state: string) => state.split('.')[1] ?? ''
