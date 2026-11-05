import { describe, expect, it } from 'vitest'
import { answerInFull } from '@/app/mcp/answer-in-full'

const post = (body: unknown) => new Request('http://localhost/mcp', { method: 'POST', body: JSON.stringify(body) })

function slowStream(onEnd: () => void) {
  return new Response(
    new ReadableStream({
      async start(controller) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        controller.enqueue(new TextEncoder().encode('done'))
        onEnd()
        controller.close()
      },
    }),
    { status: 200, headers: { 'x-kept': 'yes' } },
  )
}

describe('answerInFull', () => {
  it("reads a tool's answer to its end before returning, keeping status and headers", async () => {
    let ended = false
    const response = await answerInFull(post({ method: 'tools/call' }), async () => slowStream(() => (ended = true)))
    expect(ended).toBe(true)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-kept')).toBe('yes')
    expect(await response.text()).toBe('done')
  })

  it("doesn't hold back anything else: a listening stream never ends", async () => {
    let ended = false
    await answerInFull(post({ method: 'tools/list' }), async () => slowStream(() => (ended = true)))
    expect(ended).toBe(false)
    const get = new Request('http://localhost/mcp')
    await answerInFull(get, async () => slowStream(() => (ended = true)))
    expect(ended).toBe(false)
  })

  it('leaves the request readable for the handler', async () => {
    const body = { method: 'tools/call' }
    const response = await answerInFull(post(body), async (request) => new Response(JSON.stringify(await request.json())))
    expect(await response.json()).toEqual(body)
  })
})
