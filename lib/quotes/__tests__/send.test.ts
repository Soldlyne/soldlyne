import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workspaceForFile } from '@/test/fixtures'
import { createDealFixture, fillSeller, TWO_RATES } from './fixtures'

const { prisma } = await import('@/lib/prisma')
const { withMcpActor } = await import('@/lib/actor')
const { sha256 } = await import('@/lib/hash')
const { copyQuote, createQuote, updateQuote } = await import('../quotes')
const { quoteMail, renewQuoteLink, sendQuote } = await import('../send')
const { missingToSend } = await import('../send-rules')
const { quoteDocument } = await import('../document')
const { readQuote } = await import('../queries')
const { seeQuoteAtLink } = await import('../answer')
const { sellerCopyOf } = await import('../parties')

const here = workspaceForFile('quote-send')
const noSeller = workspaceForFile('quote-send-no-seller')
const asMember = <T>(work: () => Promise<T>) => here.run(() => withMcpActor('test', work))
const withoutSeller = <T>(work: () => Promise<T>) => noSeller.run(() => withMcpActor('test', work))

let tagCount = 0
const nextTag = () => `s${Date.now()}-${tagCount++}`

const MAIL_SETTINGS = { RESEND_API_KEY: 'key', SOLDLYNE_MAIL_FROM: 'Quotes <quotes@soldlyne.example>' }

/** Catches what would go to the mail provider. */
function catchMail(respond: () => Response = () => new Response('{"id":"1"}')) {
  const sent: { to: string[]; subject: string; text: string; reply_to?: string }[] = []
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)))
    return respond()
  })
  return sent
}

const linkIn = (text: string) => text.match(/https?:\/\/\S+/)![0]
const tokenIn = (link: string) => decodeURIComponent(new URL(link).pathname.split('/')[2])

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = 'a-secret-for-these-tests'
  process.env.BETTER_AUTH_URL = 'http://localhost:3100'
  delete process.env.RESEND_API_KEY
  delete process.env.SOLDLYNE_MAIL_FROM
})

afterEach(() => vi.unstubAllGlobals())

async function draftWithLines(tag = nextTag(), options: Parameters<typeof createDealFixture>[1] = {}) {
  const fixture = await createDealFixture(tag, options)
  const { id, reference } = await createQuote({ dealId: fixture.deal.id, lines: TWO_RATES })
  return { ...fixture, id, reference }
}

describe('what stops a quote from going', () => {
  const seller = sellerCopyOf({ legalName: 'Northwind Works', address: 'Paris', companyNumber: '123', contactEmail: 'a@b.example' })
  const customer = { companyName: 'Acme', city: '', country: '', contactName: 'Ada', contactEmail: 'ada@acme.example' }
  const now = new Date('2026-11-05T10:00:00Z')
  const fine = { seller, customer, lineCount: 1, validUntil: new Date('2026-11-05T00:00:00Z') }

  it('is nothing when all is there, the VAT number not being needed', () => {
    expect(missingToSend(fine, { canMail: true, now })).toEqual([])
  })

  it('names each missing seller detail', () => {
    const [reason] = missingToSend({ ...fine, seller: sellerCopyOf({ legalName: ' ', address: 'Paris' }) }, { canMail: true, now })
    expect(reason).toBe('The seller details lack: legal name, company number, contact email. Owners and admins fill them in Settings.')
  })

  it('says when there are no lines, no customer, or a passed date', () => {
    expect(missingToSend({ ...fine, lineCount: 0 }, { canMail: true, now })).toEqual(['The quote has no lines.'])
    expect(missingToSend({ ...fine, customer: { ...customer, companyName: '', contactName: '', contactEmail: '' } }, { canMail: false, now })).toEqual(['The quote names no customer: choose a company or a contact.'])
    expect(missingToSend({ ...fine, validUntil: new Date('2026-11-04T00:00:00Z') }, { canMail: true, now })).toEqual(['The valid-until date, 4 Nov 2026, has passed.'])
  })

  it('asks for an address only when a mail could go', () => {
    const noAddress = { ...fine, customer: { ...customer, contactEmail: '' } }
    expect(missingToSend(noAddress, { canMail: false, now })).toEqual([])
    expect(missingToSend(noAddress, { canMail: true, now })).toEqual(['The quote has no address to go to: choose a contact with an email address.'])
  })
})

describe('sending', () => {
  it('refuses without seller details, saying what lacks, and leaves the draft as it was', async () => {
    const { id } = await withoutSeller(() => draftWithLines())
    await expect(withoutSeller(() => sendQuote(id))).rejects.toThrow('The seller details lack: legal name, address, company number, contact email.')
    expect(await withoutSeller(() => prisma.quote.findUniqueOrThrow({ where: { id } }))).toMatchObject({ status: 'DRAFT', tokenHash: null, sellerCopy: null })
  })

  it('mails the customer a link, with replies going to the seller', async () => {
    await asMember(() => fillSeller())
    Object.assign(process.env, MAIL_SETTINGS)
    const mail = catchMail()
    const { id, reference, contact } = await asMember(() => draftWithLines())
    const sent = await asMember(() => sendQuote(id))
    expect(sent).toMatchObject({ id, reference, mailedTo: contact.emails[0], link: null })
    expect(mail).toHaveLength(1)
    expect(mail[0].to).toEqual(contact.emails)
    expect(mail[0].reply_to).toBe('sales@northwind.example')
    expect(mail[0].subject).toBe(`Quote ${reference} from Northwind Works`)
    expect(mail[0].text).toContain('Hello Ada Martin')
    expect(mail[0].text.replace(/\s/g, ' ')).toContain('EUR 525.57')
    expect(linkIn(mail[0].text)).toMatch(/^http:\/\/localhost:3100\/q\//)
  })

  it('stores only a hash of the link: the link is nowhere in the row or the timeline', async () => {
    Object.assign(process.env, MAIL_SETTINGS)
    const mail = catchMail()
    const { id, deal } = await asMember(() => draftWithLines())
    await asMember(() => sendQuote(id))
    const token = tokenIn(linkIn(mail[0].text))
    const row = await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))
    expect(row.tokenHash).toBe(sha256(token))
    expect(JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))).not.toContain(token)
    const events = await asMember(() => prisma.timelineEvent.findMany({ where: { dealId: deal.id } }))
    expect(JSON.stringify(events)).not.toContain(token)
  })

  it('never logs the link', async () => {
    const logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method))
    Object.assign(process.env, MAIL_SETTINGS)
    const mail = catchMail()
    const { id } = await asMember(() => draftWithLines())
    await asMember(() => sendQuote(id))
    const token = tokenIn(linkIn(mail[0].text))
    await seeQuoteAtLink(token)
    const written = logged.flatMap((spy) => spy.mock.calls.flat()).map(String).join(' ')
    expect(written).not.toContain(token)
    for (const spy of logged) spy.mockRestore()
  })

  it('shows the link to copy when the install has no mail, and needs no address then', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { id } = await asMember(() => draftWithLines(nextTag(), { contactEmail: null }))
    const sent = await asMember(() => sendQuote(id))
    expect(sent.mailedTo).toBeNull()
    expect(sent.link).toMatch(/^http:\/\/localhost:3100\/q\//)
    expect(fetch).not.toHaveBeenCalled()
    expect((await seeQuoteAtLink(tokenIn(sent.link!))).found).toBe(true)
  })

  it('shows the link when the provider refuses the mail: the quote is sent all the same', async () => {
    Object.assign(process.env, MAIL_SETTINGS)
    catchMail(() => new Response('{"message":"bad sender"}', { status: 403 }))
    const { id } = await asMember(() => draftWithLines())
    const sent = await asMember(() => sendQuote(id))
    expect(sent.mailedTo).toBeNull()
    expect(sent.link).toBeTruthy()
    expect((await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))).status).toBe('SENT')
  })

  it('refuses when a mail should go and there is no address', async () => {
    Object.assign(process.env, MAIL_SETTINGS)
    catchMail()
    const { id } = await asMember(() => draftWithLines(nextTag(), { contactEmail: null }))
    await expect(asMember(() => sendQuote(id))).rejects.toThrow('no address to go to')
  })

  it('goes once', async () => {
    const { id } = await asMember(() => draftWithLines())
    await asMember(() => sendQuote(id))
    await expect(asMember(() => sendQuote(id))).rejects.toThrow('already been sent')
  })

  it('goes once when asked twice at the same moment', async () => {
    const { id } = await asMember(() => draftWithLines())
    const outcomes = await Promise.allSettled([asMember(() => sendQuote(id)), asMember(() => sendQuote(id))])
    expect(outcomes.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected'])
  })

  it('records it on the timeline, without the customer having to look', async () => {
    const { id, deal, reference } = await asMember(() => draftWithLines())
    await asMember(() => sendQuote(id))
    const event = await asMember(() => prisma.timelineEvent.findFirstOrThrow({ where: { dealId: deal.id, name: 'quote.sent' } }))
    expect(event).toMatchObject({ actor: 'MCP', properties: { reference, to: null } })
  })

  it("can't reach another workspace's quote", async () => {
    const { id } = await withoutSeller(() => draftWithLines())
    await expect(asMember(() => sendQuote(id))).rejects.toThrow("This quote doesn't exist.")
  })
})

describe('a sent quote', () => {
  it("keeps the seller and customer it was sent with, whatever is edited later", async () => {
    const { id, company, contact, deal } = await asMember(() => draftWithLines())
    const original = await asMember(() => prisma.sellerDetails.findFirstOrThrow())
    const sent = await asMember(() => sendQuote(id))
    await asMember(() => prisma.sellerDetails.update({ where: { id: original.id }, data: { legalName: 'Renamed Ltd', address: 'Elsewhere', vatNumber: 'NEW', contactEmail: 'new@renamed.example' } }))
    await asMember(() => prisma.company.update({ where: { id: company.id }, data: { name: 'Acme Renamed', city: 'Nice' } }))
    await asMember(() => prisma.person.update({ where: { id: contact.id }, data: { firstName: 'Grace', emails: ['grace@other.example'] } }))
    await asMember(() => prisma.deal.update({ where: { id: deal.id }, data: { name: 'Renamed deal' } }))
    const seen = await seeQuoteAtLink(tokenIn(sent.link!))
    if (!seen.found) throw new Error('not found')
    expect(seen.document.seller).toMatchObject({ legalName: 'Northwind Works', address: '1 Example Street\n75000 Paris', vatNumber: 'FR00123456789' })
    expect(seen.document.customer).toMatchObject({ companyName: company.name, city: 'Lyon', contactName: 'Ada Martin', contactEmail: contact.emails[0] })
    await asMember(() => prisma.sellerDetails.update({ where: { id: original.id }, data: { legalName: 'Northwind Works', address: '1 Example Street\n75000 Paris', vatNumber: 'FR00123456789', contactEmail: 'sales@northwind.example' } }))
  })

  it("can't be edited, a member's screen and an assistant alike", async () => {
    const { id } = await asMember(() => draftWithLines())
    await asMember(() => sendQuote(id))
    const before = await asMember(() => readQuote(id))
    await expect(asMember(() => updateQuote(id, { notes: 'Too late' }))).rejects.toThrow("can't be edited")
    await expect(asMember(() => updateQuote(id, { lines: [{ description: 'Sneaked in', quantity: 1, unitPrice: 1, taxRate: 0 }] }))).rejects.toThrow("can't be edited")
    expect(await asMember(() => readQuote(id))).toEqual(before)
  })

  it('changes by being copied: the copy is a new draft and the original stays', async () => {
    const { id, reference } = await asMember(() => draftWithLines())
    await asMember(() => sendQuote(id))
    const copy = await asMember(() => copyQuote(id))
    await asMember(() => updateQuote(copy.id, { notes: 'The new version' }))
    const [original, draft] = await asMember(() => Promise.all([readQuote(id), readQuote(copy.id)]))
    expect(original).toMatchObject({ status: 'SENT', reference, notes: null })
    expect(draft).toMatchObject({ status: 'DRAFT', notes: 'The new version', sellerCopy: null, customerCopy: null, tokenHash: null, sentAt: null })
  })

  it("a draft's preview shows the seller as they stand today, a sent one what was sent", async () => {
    const { id } = await asMember(() => draftWithLines())
    const live = await asMember(() => prisma.sellerDetails.findFirstOrThrow())
    const today = { ...live, legalName: 'Today Ltd' }
    expect(quoteDocument((await asMember(() => readQuote(id)))!, today).seller.legalName).toBe('Today Ltd')
    await asMember(() => sendQuote(id))
    expect(quoteDocument((await asMember(() => readQuote(id)))!, today).seller.legalName).toBe('Northwind Works')
  })
})

describe('a new link', () => {
  it('replaces the old one, which stops working', async () => {
    const { id } = await asMember(() => draftWithLines())
    const first = await asMember(() => sendQuote(id))
    const second = await asMember(() => renewQuoteLink(id))
    expect(second.link).not.toBe(first.link)
    expect((await seeQuoteAtLink(tokenIn(first.link!))).found).toBe(false)
    expect((await seeQuoteAtLink(tokenIn(second.link!))).found).toBe(true)
  })

  it('is mailed to the address the quote went to, not the one the contact has now', async () => {
    Object.assign(process.env, MAIL_SETTINGS)
    const mail = catchMail()
    const { id, contact } = await asMember(() => draftWithLines())
    await asMember(() => sendQuote(id))
    await asMember(() => prisma.person.update({ where: { id: contact.id }, data: { emails: ['moved@other.example'] } }))
    await asMember(() => renewQuoteLink(id))
    expect(mail[1].to).toEqual(contact.emails)
  })

  it('is only for a quote still waiting', async () => {
    const { id } = await asMember(() => draftWithLines())
    await expect(asMember(() => renewQuoteLink(id))).rejects.toThrow('still waiting')
    await asMember(() => sendQuote(id))
    await asMember(() => prisma.quote.update({ where: { id }, data: { validUntil: new Date('2020-01-01') } }))
    await expect(asMember(() => renewQuoteLink(id))).rejects.toThrow('still waiting')
  })
})

describe('the mail', () => {
  it('reads plainly, without a name when there is none', () => {
    const seller = sellerCopyOf({ legalName: 'Northwind Works' })
    const { subject, text } = quoteMail({ reference: '2026-0042', currency: 'EUR', totalMinor: BigInt(123450), validUntil: new Date('2026-12-05T00:00:00Z') }, seller, { companyName: 'Acme', city: '', country: '', contactName: '', contactEmail: 'a@acme.example' }, 'http://localhost/q/x')
    expect(subject).toBe('Quote 2026-0042 from Northwind Works')
    expect(text.startsWith('Hello,\n')).toBe(true)
    expect(text.replace(/\s/g, ' ')).toContain('EUR 1,234.50 tax included, good until 5 Dec 2026')
    expect(text).toContain('http://localhost/q/x')
  })
})
