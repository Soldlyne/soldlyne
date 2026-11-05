import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendOwnMail } from '../mail'

const SET_UP = { RESEND_API_KEY: 'key', SOLDLYNE_MAIL_FROM: 'Soldlyne <soldlyne@example.com>' }
const MAIL = { to: 'a@example.com', subject: 'Subject', text: 'Text' }

afterEach(() => vi.unstubAllGlobals())

describe('own mail', () => {
  it('sends through Resend with the key and the sender', async () => {
    const fetch = vi.fn(async () => new Response('{"id":"1"}'))
    vi.stubGlobal('fetch', fetch)
    expect(await sendOwnMail(SET_UP, MAIL)).toBe(true)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key')
    expect(JSON.parse(String(init.body))).toEqual({ from: SET_UP.SOLDLYNE_MAIL_FROM, to: ['a@example.com'], subject: 'Subject', text: 'Text' })
  })

  it('says who a reply goes to when asked', async () => {
    const fetch = vi.fn(async () => new Response('{"id":"1"}'))
    vi.stubGlobal('fetch', fetch)
    await sendOwnMail(SET_UP, { ...MAIL, replyTo: 'seller@example.com' })
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body)).reply_to).toBe('seller@example.com')
  })

  it.each([{}, { RESEND_API_KEY: 'key' }, { SOLDLYNE_MAIL_FROM: 'a@example.com' }])('sends nothing without both settings: %o', async (settings) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await sendOwnMail(settings, MAIL)).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('says so when Resend refuses', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"message":"bad sender"}', { status: 403 }))
    await expect(sendOwnMail(SET_UP, MAIL)).rejects.toThrow('403')
  })
})
