import { describe, expect, it } from 'vitest'
import { authorizationUrl, GOOGLE_SCOPES, redirectUri } from '../client'

describe('Google connect flow', () => {
  it('asks for read access only', () => {
    expect(GOOGLE_SCOPES.join(' ')).not.toMatch(/gmail\.(send|compose|modify)|mail\.google\.com|calendar\.events(?!\.readonly)/)
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/gmail.readonly')
    expect(GOOGLE_SCOPES).toContain('https://www.googleapis.com/auth/calendar.events.readonly')
  })

  it('sends Google to the callback, with the client it was given, without earlier grants', () => {
    const url = new URL(authorizationUrl({ clientId: 'client', clientSecret: 'secret' }, 'https://crm.example', 'state-1', 'me@crm.example'))
    expect(url.searchParams.get('client_id')).toBe('client')
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri('https://crm.example'))
    expect(redirectUri('https://crm.example')).toBe('https://crm.example/api/google/callback')
    expect(url.searchParams.get('scope')).toBe(GOOGLE_SCOPES.join(' '))
    expect(url.searchParams.has('include_granted_scopes')).toBe(false)
    expect(url.searchParams.get('login_hint')).toBe('me@crm.example')
  })

  it('never puts the secret in the address the browser goes to', () => {
    expect(authorizationUrl({ clientId: 'client', clientSecret: 'the-secret' }, 'https://crm.example', 'state-1')).not.toContain('the-secret')
  })
})
