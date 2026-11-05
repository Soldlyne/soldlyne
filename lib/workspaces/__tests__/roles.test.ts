import { describe, expect, it } from 'vitest'
import { managesTeam, refusalToChangeRole, refusalToLeave, refusalToRemove, type Teammate } from '../roles'

const team: Teammate[] = [
  { userId: 'owner', role: 'OWNER' },
  { userId: 'admin', role: 'ADMIN' },
  { userId: 'member', role: 'MEMBER' },
]
const twoOwners: Teammate[] = [...team, { userId: 'second', role: 'OWNER' }]

describe('who manages the team', () => {
  it('owners and admins do, members and strangers do not', () => {
    expect(managesTeam('OWNER')).toBe(true)
    expect(managesTeam('ADMIN')).toBe(true)
    expect(managesTeam('MEMBER')).toBe(false)
    expect(managesTeam(undefined)).toBe(false)
  })

  it('a member removes nobody and changes no role', () => {
    expect(refusalToRemove(team, 'member', 'admin')).toContain('Only owners and admins')
    expect(refusalToChangeRole(team, 'member', 'admin', 'MEMBER')).toContain('Only owners and admins')
  })

  it("someone outside the workspace changes nothing, and someone gone can't be removed", () => {
    expect(refusalToRemove(team, 'stranger', 'member')).toContain('Only owners and admins')
    expect(refusalToRemove(team, 'owner', 'stranger')).toContain('no longer')
  })

  it('an admin manages members but not owners, and names no owner', () => {
    expect(refusalToRemove(team, 'admin', 'member')).toBeNull()
    expect(refusalToChangeRole(team, 'admin', 'member', 'ADMIN')).toBeNull()
    expect(refusalToRemove(twoOwners, 'admin', 'owner')).toContain('Only an owner')
    expect(refusalToChangeRole(twoOwners, 'admin', 'owner', 'MEMBER')).toContain('Only an owner')
    expect(refusalToChangeRole(team, 'admin', 'admin', 'OWNER')).toContain('Only an owner')
  })
})

describe('the last owner', () => {
  it("can't be removed, demoted or leave", () => {
    expect(refusalToRemove(team, 'owner', 'owner')).toContain('keeps an owner')
    expect(refusalToChangeRole(team, 'owner', 'owner', 'ADMIN')).toContain('keeps an owner')
    expect(refusalToLeave(team, 'owner')).toContain('keeps an owner')
  })

  it('can do all of it once there is a second owner', () => {
    expect(refusalToRemove(twoOwners, 'owner', 'second')).toBeNull()
    expect(refusalToChangeRole(twoOwners, 'owner', 'owner', 'ADMIN')).toBeNull()
    expect(refusalToLeave(twoOwners, 'owner')).toBeNull()
  })

  it('anyone else may leave', () => {
    expect(refusalToLeave(team, 'admin')).toBeNull()
    expect(refusalToRemove(team, 'member', 'member')).toBeNull()
  })

  it('an owner may hand ownership on', () => {
    expect(refusalToChangeRole(team, 'owner', 'member', 'OWNER')).toBeNull()
  })
})
