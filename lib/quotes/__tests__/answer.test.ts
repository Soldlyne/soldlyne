import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { workspaceForFile } from '@/test/fixtures'
import { createDealFixture, fillSeller, TWO_RATES } from './fixtures'

const { prisma } = await import('@/lib/prisma')
const { trustedPrisma } = await import('@/lib/trusted-prisma')
const { withMcpActor } = await import('@/lib/actor')
const { createQuote } = await import('../quotes')
const { sendQuote } = await import('../send')
const { acceptQuoteAtLink, declineQuoteAtLink, LINK_UNKNOWN, markQuoteDeclined, seeQuoteAtLink } = await import('../answer')
const { isSignedQuoteToken, newQuoteToken } = await import('../token')
const { quotePdf } = await import('../pdf')

const here = workspaceForFile('quote-answer')
const elsewhere = workspaceForFile('quote-answer-elsewhere')
const noWonStage = workspaceForFile('quote-answer-no-won')
const asMember = <T>(work: () => Promise<T>) => here.run(() => withMcpActor('test', work))
const asOther = <T>(work: () => Promise<T>) => elsewhere.run(() => withMcpActor('test', work))

const ADA = { name: 'Ada Martin', confirmed: true }
const FROM = { ip: '203.0.113.7', userAgent: 'Test browser/1.0' }

let tagCount = 0
const nextTag = () => `a${Date.now()}-${tagCount++}`

const stageNamed = (name: string) => prisma.stage.findFirstOrThrow({ where: { name } })

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = 'a-secret-for-these-tests'
  process.env.BETTER_AUTH_URL = 'http://localhost:3100'
  delete process.env.RESEND_API_KEY
  delete process.env.SOLDLYNE_MAIL_FROM
  await asMember(async () => {
    await fillSeller()
    await prisma.stage.createMany({
      data: [
        { name: 'Open', kind: 'OPEN', position: 0 },
        { name: 'Signed later', kind: 'WON', position: 20 },
        { name: 'Signed', kind: 'WON', position: 10 },
        { name: 'Lost', kind: 'LOST', position: 30 },
      ],
    })
  })
  await asOther(fillSeller)
  await noWonStage.run(() => withMcpActor('test', async () => void (await fillSeller())))
})

beforeEach(() => {
  delete process.env.RESEND_API_KEY
})

/** A quote sent and its link's token, with its deal and all around it. */
async function sentQuote(run: typeof asMember = asMember) {
  return run(async () => {
    const fixture = await createDealFixture(nextTag())
    const { id, reference } = await createQuote({ dealId: fixture.deal.id, lines: TWO_RATES })
    const { link } = await sendQuote(id)
    return { ...fixture, id, reference, token: decodeURIComponent(new URL(link!).pathname.split('/')[2]) }
  })
}

const eventsOf = (dealId: string, name: string) => prisma.timelineEvent.findMany({ where: { dealId, name } })

describe('the token', () => {
  it('is signed by this install, and tampering shows', () => {
    const token = newQuoteToken('secret')
    expect(isSignedQuoteToken(token, 'secret')).toBe(true)
    expect(isSignedQuoteToken(token, 'other secret')).toBe(false)
    expect(isSignedQuoteToken(`${token}x`, 'secret')).toBe(false)
    expect(isSignedQuoteToken(`x${token}`, 'secret')).toBe(false)
    expect(isSignedQuoteToken(token.split('.')[0], 'secret')).toBe(false)
    expect(isSignedQuoteToken(`${token}.more`, 'secret')).toBe(false)
    expect(isSignedQuoteToken('', 'secret')).toBe(false)
    expect(isSignedQuoteToken(token, undefined)).toBe(false)
  })

  it('differs each time', () => {
    expect(newQuoteToken('secret')).not.toBe(newQuoteToken('secret'))
  })

  it("can't be made without the install's secret", () => {
    const saved = process.env.BETTER_AUTH_SECRET
    delete process.env.BETTER_AUTH_SECRET
    expect(() => newQuoteToken()).toThrow('BETTER_AUTH_SECRET')
    process.env.BETTER_AUTH_SECRET = saved
  })

  it("turns a forged link away without reading the database: a bot trying links doesn't wake it", async () => {
    const lookup = vi.spyOn(trustedPrisma.quote, 'findUnique')
    expect(await seeQuoteAtLink('made.up')).toEqual({ found: false })
    expect(await seeQuoteAtLink(newQuoteToken('not this install'))).toEqual({ found: false })
    expect(lookup).not.toHaveBeenCalled()
    await seeQuoteAtLink(newQuoteToken())
    expect(lookup).toHaveBeenCalledTimes(1)
    lookup.mockRestore()
  })

  it('finds nothing for a well-signed token no quote holds', async () => {
    expect(await seeQuoteAtLink(newQuoteToken())).toEqual({ found: false })
  })
})

describe('what the customer sees', () => {
  it('is the quote at its link, with no session, whichever workspace it is in', async () => {
    const ours = await sentQuote()
    const theirs = await sentQuote(asOther)
    const [seenOurs, seenTheirs] = await Promise.all([seeQuoteAtLink(ours.token), seeQuoteAtLink(theirs.token)])
    if (!seenOurs.found || !seenTheirs.found) throw new Error('not found')
    expect(seenOurs.document).toMatchObject({ reference: ours.reference, state: 'SENT', seller: { legalName: 'Northwind Works' } })
    expect(seenTheirs.document.reference).toBe(theirs.reference)
    expect(seenOurs.document.customer.companyName).toBe(ours.company.name)
  })

  it('changes nothing by being read: mail scanners open links too', async () => {
    const { token, id, deal, open } = await sentQuote()
    await seeQuoteAtLink(token)
    await seeQuoteAtLink(token)
    expect(await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))).toMatchObject({ status: 'SENT', acceptedAt: null })
    expect(await asMember(() => prisma.deal.findUniqueOrThrow({ where: { id: deal.id } }))).toMatchObject({ stageId: open.id })
  })

  it('makes a PDF from what it sees', async () => {
    const { token } = await sentQuote()
    const seen = await seeQuoteAtLink(token)
    if (!seen.found) throw new Error('not found')
    expect(Buffer.from(await quotePdf(seen.document)).subarray(0, 5).toString()).toBe('%PDF-')
  })
})

describe('accepting', () => {
  it('records who, when and from where, and moves the deal to the first Won stage', async () => {
    const { token, id, deal, open, reference, company, contact } = await sentQuote()
    expect(await acceptQuoteAtLink(token, ADA, FROM)).toEqual({ ok: true })
    const [quote, moved, signed] = await asMember(() => Promise.all([prisma.quote.findUniqueOrThrow({ where: { id } }), prisma.deal.findUniqueOrThrow({ where: { id: deal.id } }), stageNamed('Signed')]))
    expect(quote).toMatchObject({ status: 'ACCEPTED', acceptedName: 'Ada Martin', acceptedIp: FROM.ip, acceptedUserAgent: FROM.userAgent })
    expect(quote.acceptedAt!.getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(moved.stageId).toBe(signed.id)
    expect(moved.closedAt).not.toBeNull()
    expect(moved.stageEnteredAt.getTime()).toBeGreaterThan(Date.now() - 60_000)
    const [accepted, changed] = await asMember(() => Promise.all([eventsOf(deal.id, 'quote.accepted'), eventsOf(deal.id, 'deal.stage_changed')]))
    expect(accepted).toHaveLength(1)
    expect(accepted[0]).toMatchObject({ actor: 'SYSTEM', companyId: company.id, personId: contact.id, properties: { reference, by: 'Ada Martin' } })
    expect(changed.map(({ properties }) => properties)).toEqual([{ from: open.name, to: 'Signed' }])
    expect(changed[0].actor).toBe('SYSTEM')
  })

  it('needs a typed name and the box ticked', async () => {
    const { token, id } = await sentQuote()
    expect(await acceptQuoteAtLink(token, { name: '   ', confirmed: true }, FROM)).toEqual({ ok: false, error: 'Type your name to accept.' })
    expect(await acceptQuoteAtLink(token, { name: 'Ada', confirmed: false }, FROM)).toEqual({ ok: false, error: 'Tick the box to confirm.' })
    expect((await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))).status).toBe('SENT')
  })

  it('happens once: the second is refused, and the first answer stays', async () => {
    const { token, id, deal } = await sentQuote()
    await acceptQuoteAtLink(token, ADA, FROM)
    expect(await acceptQuoteAtLink(token, { name: 'Someone Else', confirmed: true }, FROM)).toEqual({ ok: false, error: 'This quote has already been accepted.' })
    expect((await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))).acceptedName).toBe('Ada Martin')
    expect(await asMember(() => eventsOf(deal.id, 'quote.accepted'))).toHaveLength(1)
  })

  it('happens once when several arrive at the same moment', async () => {
    const { token, deal } = await sentQuote()
    const answers = await Promise.all(Array.from({ length: 8 }, (_, index) => acceptQuoteAtLink(token, { name: `Person ${index}`, confirmed: true }, FROM)))
    expect(answers.filter(({ ok }) => ok)).toHaveLength(1)
    expect(answers.filter(({ ok }) => !ok).every((answer) => !answer.ok && answer.error === 'This quote has already been accepted.')).toBe(true)
    expect(await asMember(() => eventsOf(deal.id, 'quote.accepted'))).toHaveLength(1)
    expect(await asMember(() => eventsOf(deal.id, 'deal.stage_changed'))).toHaveLength(1)
  })

  it("leaves a deal that's already closed where it is, with the event all the same", async () => {
    const { token, deal } = await sentQuote()
    await asMember(async () => prisma.deal.update({ where: { id: deal.id }, data: { stageId: (await stageNamed('Lost')).id } }))
    expect(await acceptQuoteAtLink(token, ADA, FROM)).toEqual({ ok: true })
    const moved = await asMember(() => prisma.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { stage: true } }))
    expect(moved.stage.name).toBe('Lost')
    expect(await asMember(() => eventsOf(deal.id, 'quote.accepted'))).toHaveLength(1)
    expect(await asMember(() => eventsOf(deal.id, 'deal.stage_changed'))).toHaveLength(0)
  })

  it('leaves a deal won already alone: nothing to do twice', async () => {
    const { token, deal } = await sentQuote()
    await asMember(async () => prisma.deal.update({ where: { id: deal.id }, data: { stageId: (await stageNamed('Signed later')).id } }))
    await acceptQuoteAtLink(token, ADA, FROM)
    expect((await asMember(() => prisma.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { stage: true } }))).stage.name).toBe('Signed later')
  })

  it('leaves a deleted deal alone', async () => {
    const { token, deal, open } = await sentQuote()
    await asMember(() => prisma.deal.update({ where: { id: deal.id }, data: { deletedAt: new Date() } }))
    expect(await acceptQuoteAtLink(token, ADA, FROM)).toEqual({ ok: true })
    expect((await asMember(() => prisma.deal.findUniqueOrThrow({ where: { id: deal.id } }))).stageId).toBe(open.id)
  })

  it('still works in a workspace with no Won stage, and moves nothing', async () => {
    const quote = await sentQuote((work) => noWonStage.run(() => withMcpActor('test', work)))
    expect(await acceptQuoteAtLink(quote.token, ADA, FROM)).toEqual({ ok: true })
    expect((await noWonStage.run(() => prisma.deal.findUniqueOrThrow({ where: { id: quote.deal.id } }))).stageId).toBe(quote.open.id)
  })

  it("is refused with a dead link's words for a link that opens nothing", async () => {
    expect(await acceptQuoteAtLink('made.up', ADA, FROM)).toEqual({ ok: false, error: LINK_UNKNOWN })
    expect(await acceptQuoteAtLink(newQuoteToken(), ADA, FROM)).toEqual({ ok: false, error: LINK_UNKNOWN })
  })

  it('keeps a very long name or browser to a sane length', async () => {
    const { token, id } = await sentQuote()
    await acceptQuoteAtLink(token, { name: 'A'.repeat(1000), confirmed: true }, { ip: '1'.repeat(1000), userAgent: 'B'.repeat(10_000) })
    const quote = await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))
    expect(quote.acceptedName).toHaveLength(200)
    expect(quote.acceptedIp).toHaveLength(64)
    expect(quote.acceptedUserAgent).toHaveLength(500)
  })
})

describe('expiry', () => {
  const lapse = (id: string, days: number) => asMember(() => prisma.quote.update({ where: { id }, data: { validUntil: new Date(Date.now() + days * 86_400_000) } }))

  it('stops an answer once the last day has passed, and leaves the deal', async () => {
    const { token, id, deal, open } = await sentQuote()
    await lapse(id, -1)
    const seen = await seeQuoteAtLink(token)
    if (!seen.found) throw new Error('not found')
    expect(seen.document.state).toBe('EXPIRED')
    const refused = { ok: false, error: 'This quote has expired. Ask whoever sent it for a new one.' }
    expect(await acceptQuoteAtLink(token, ADA, FROM)).toEqual(refused)
    expect(await declineQuoteAtLink(token, null)).toEqual(refused)
    expect(await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))).toMatchObject({ status: 'SENT', acceptedAt: null, declinedAt: null })
    expect((await asMember(() => prisma.deal.findUniqueOrThrow({ where: { id: deal.id } }))).stageId).toBe(open.id)
  })

  it('leaves the whole last day good', async () => {
    const { token, id } = await sentQuote()
    await lapse(id, 0)
    expect(await acceptQuoteAtLink(token, ADA, FROM)).toEqual({ ok: true })
  })

  it('takes no job: nothing writes it, the status stays as sent', async () => {
    const { id } = await sentQuote()
    await lapse(id, -30)
    expect((await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))).status).toBe('SENT')
  })

  it('is not hidden by an answer given in time', async () => {
    const { token, id } = await sentQuote()
    await acceptQuoteAtLink(token, ADA, FROM)
    await lapse(id, -30)
    const seen = await seeQuoteAtLink(token)
    if (!seen.found) throw new Error('not found')
    expect(seen.document.state).toBe('ACCEPTED')
    expect(seen.document.accepted?.name).toBe('Ada Martin')
  })
})

describe('declining', () => {
  it('records the reason and a timeline event, and leaves the deal where it is', async () => {
    const { token, id, deal, open, reference } = await sentQuote()
    expect(await declineQuoteAtLink(token, '  Too expensive  ')).toEqual({ ok: true })
    const quote = await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))
    expect(quote).toMatchObject({ status: 'DECLINED', declineReason: 'Too expensive', acceptedAt: null })
    expect(quote.declinedAt).not.toBeNull()
    expect((await asMember(() => prisma.deal.findUniqueOrThrow({ where: { id: deal.id } }))).stageId).toBe(open.id)
    const [event] = await asMember(() => eventsOf(deal.id, 'quote.declined'))
    expect(event).toMatchObject({ actor: 'SYSTEM', properties: { reference, reason: 'Too expensive' } })
  })

  it('needs no reason', async () => {
    const { token, id } = await sentQuote()
    expect(await declineQuoteAtLink(token, '')).toEqual({ ok: true })
    expect((await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))).declineReason).toBeNull()
  })

  it('closes the quote to any later answer, and an accepted one to a no', async () => {
    const declined = await sentQuote()
    await declineQuoteAtLink(declined.token, null)
    expect(await acceptQuoteAtLink(declined.token, ADA, FROM)).toEqual({ ok: false, error: 'This quote has already been declined.' })
    expect(await declineQuoteAtLink(declined.token, null)).toEqual({ ok: false, error: 'This quote has already been declined.' })
    const accepted = await sentQuote()
    await acceptQuoteAtLink(accepted.token, ADA, FROM)
    expect(await declineQuoteAtLink(accepted.token, null)).toEqual({ ok: false, error: 'This quote has already been accepted.' })
  })

  it('can be recorded by a member, on a quote expired or not, and only on a sent one', async () => {
    const { id, deal, token } = await sentQuote()
    await asMember(() => prisma.quote.update({ where: { id }, data: { validUntil: new Date('2020-01-01') } }))
    await asMember(() => markQuoteDeclined(id, 'They told me by phone'))
    expect(await asMember(() => prisma.quote.findUniqueOrThrow({ where: { id } }))).toMatchObject({ status: 'DECLINED', declineReason: 'They told me by phone' })
    expect((await asMember(() => eventsOf(deal.id, 'quote.declined')))[0].actor).toBe('MCP')
    await expect(asMember(() => markQuoteDeclined(id, null))).rejects.toThrow('Only a sent quote')
    const seen = await seeQuoteAtLink(token)
    expect(seen.found && seen.document.state).toBe('DECLINED')
    const draft = await asMember(async () => createQuote({ dealId: (await createDealFixture(nextTag())).deal.id }))
    await expect(asMember(() => markQuoteDeclined(draft.id, null))).rejects.toThrow('Only a sent quote')
  })

  it("can't be recorded on another workspace's quote", async () => {
    const { id } = await sentQuote(asOther)
    await expect(asMember(() => markQuoteDeclined(id, null))).rejects.toThrow("This quote doesn't exist.")
  })
})
