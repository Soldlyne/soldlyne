import { describe, expect, it } from 'vitest'
import { workspaceForFile } from '@/test/fixtures'

const { prisma } = await import('@/lib/prisma')
const { withMcpActor } = await import('@/lib/actor')
const { createPerson } = await import('../actions')

const linkedinUrl = `https://www.linkedin.com/in/person-${Date.now()}`
const workspace = workspaceForFile('create-person')
const other = workspaceForFile('create-person-other')

describe('createPerson', () => {
  it('saves the LinkedIn profile and refuses it twice', () =>
    workspace.run(() =>
      withMcpActor('test', async () => {
        const { id } = await createPerson({ firstName: 'Camille', linkedinUrl })
        expect((await prisma.person.findUniqueOrThrow({ where: { id } })).linkedinUrl).toBe(linkedinUrl)
        await expect(createPerson({ firstName: 'Other', linkedinUrl })).rejects.toThrow('already in Soldlyne')
      }),
    ))

  it('takes the same profile in another workspace: they share nothing', () =>
    other.run(() =>
      withMcpActor('test', async () => {
        const { id } = await createPerson({ firstName: 'Camille', linkedinUrl })
        expect(id).toBeTruthy()
      }),
    ))
})
