import { describe, expect, it } from 'vitest'
import { newOAuthState, oauthStateIsFor, workspaceOfOAuthState } from '../state'

const SECRET = 'a-secret-for-these-tests'
const state = newOAuthState('random', 'workspace-a', 'member-a', SECRET)

describe("the OAuth state's round trip", () => {
  it('names its workspace', () => {
    expect(workspaceOfOAuthState(state)).toBe('workspace-a')
  })

  it('holds for the member who asked', () => {
    expect(oauthStateIsFor(state, 'member-a', SECRET)).toBe(true)
  })

  it("doesn't hold for another member, or under another secret", () => {
    expect(oauthStateIsFor(state, 'member-b', SECRET)).toBe(false)
    expect(oauthStateIsFor(state, 'member-a', 'another-secret')).toBe(false)
  })

  it("can't be moved to another workspace", () => {
    const [random, , signed] = state.split('.')
    expect(oauthStateIsFor(`${random}.workspace-b.${signed}`, 'member-a', SECRET)).toBe(false)
  })

  it.each(['', 'random', 'random.workspace-a', `${state}.extra`, 'random..signature'])('refuses a malformed state: %s', (malformed) => {
    expect(oauthStateIsFor(malformed, 'member-a', SECRET)).toBe(false)
  })

  it("doesn't reveal the member", () => {
    expect(state).not.toContain('member-a')
  })
})
