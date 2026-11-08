import { describe, expect, it } from 'vitest'
import { qqAvatarUrl, resolveUserAvatar } from './avatar'

describe('QQ avatar helpers', () => {
  it('builds the qlogo URL from appid and user openid', () => {
    expect(qqAvatarUrl('102030405', 'F4A3B2C1D5E6F708091A2B3C4D5E6F70')).toBe(
      'https://q.qlogo.cn/qqapp/102030405/F4A3B2C1D5E6F708091A2B3C4D5E6F70/100',
    )
  })

  it('trims both parts and encodes the openid', () => {
    expect(qqAvatarUrl(' 102030405 ', ' user/1 ')).toBe(
      'https://q.qlogo.cn/qqapp/102030405/user%2F1/100',
    )
  })

  it('returns null without a valid appid or openid', () => {
    expect(qqAvatarUrl(null, 'openid')).toBeNull()
    expect(qqAvatarUrl('', 'openid')).toBeNull()
    expect(qqAvatarUrl('not-an-appid', 'openid')).toBeNull()
    expect(qqAvatarUrl('123', 'openid')).toBeNull()
    expect(qqAvatarUrl('102030405', null)).toBeNull()
    expect(qqAvatarUrl('102030405', '   ')).toBeNull()
  })

  it('prefers an avatar supplied by the API', () => {
    const user = { openid: 'openid-1', avatar: 'https://example.com/a.png' }
    expect(resolveUserAvatar('102030405', user)).toBe('https://example.com/a.png')
  })

  it('falls back to the real QQ avatar', () => {
    expect(resolveUserAvatar('102030405', { openid: 'openid-1' })).toBe(
      'https://q.qlogo.cn/qqapp/102030405/openid-1/100',
    )
    expect(resolveUserAvatar('102030405', { openid: 'openid-1', avatar: '  ' })).toBe(
      'https://q.qlogo.cn/qqapp/102030405/openid-1/100',
    )
    expect(resolveUserAvatar('102030405', null)).toBeNull()
  })
})
