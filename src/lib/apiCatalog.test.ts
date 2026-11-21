import { describe, expect, it } from 'vitest'
import { CATALOG, CATEGORIES, getEndpoint } from './apiCatalog'
import type { HttpMethod } from './apiCatalog'
import { messageScopeForPath } from './messageBuilder'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

describe('API catalogue', () => {
  it('has a reasonable number of endpoints', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(45)
  })

  it('uses unique ids and valid HTTP methods', () => {
    const ids = new Set<string>()
    for (const endpoint of CATALOG) {
      expect(ids.has(endpoint.id), `duplicate id ${endpoint.id}`).toBe(false)
      ids.add(endpoint.id)
      expect(METHODS).toContain(endpoint.method)
    }
  })

  it('keeps path placeholders and pathParams in sync', () => {
    for (const endpoint of CATALOG) {
      const placeholders = [...endpoint.path.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(
        (match) => match[1],
      )
      expect(endpoint.pathParams.map((param) => param.name)).toEqual(placeholders)
    }
  })

  it('only uses methods that make sense for a request body', () => {
    for (const endpoint of CATALOG) {
      if (endpoint.method === 'GET' || endpoint.method === 'DELETE') {
        // GET must not carry a template body; DELETE may (QQ uses DELETE bodies).
        if (endpoint.method === 'GET') expect(endpoint.body).toBe('')
      }
    }
  })

  it('exposes stable categories and lookup by id', () => {
    expect(CATEGORIES).toContain('基础')
    expect(CATEGORIES).toContain('群聊')
    expect(CATEGORIES).toContain('频道')
    const endpoint = getEndpoint('group.send_message')
    expect(endpoint?.path).toBe('/v2/groups/{group_openid}/messages')
    expect(endpoint?.method).toBe('POST')
  })

  it('marks the token endpoint as credential-based rather than bearer auth', () => {
    const token = getEndpoint('app.access_token')
    expect(token?.token).toBe(true)
    expect(token?.auth).toBe(false)
  })

  it('marks every send-message endpoint with a matching message scope', () => {
    const senders = CATALOG.filter((endpoint) => endpoint.message)
    expect(senders.map((endpoint) => endpoint.id)).toEqual(
      expect.arrayContaining([
        'group.send_message',
        'c2c.send_message',
        'channel.send_message',
        'dms.send',
      ]),
    )
    for (const endpoint of senders) {
      expect(messageScopeForPath(endpoint.method, endpoint.path)).toBe(endpoint.message)
    }
  })

  // 2026-09-03 changelog: group member management APIs.
  // https://bot.q.qq.com/wiki/develop/api-v2/changelog.html#_20260903
  it('matches the documented group member management endpoints', () => {
    const list = getEndpoint('group.members.list')
    expect(list?.method).toBe('GET')
    expect(list?.path).toBe('/v2/groups/{group_openid}/members')
    expect(list?.query.map((row) => row.name)).toEqual(['cursor'])
    expect(list?.body).toBe('')
    expect(list?.auth).toBe(true)

    const detail = getEndpoint('group.members.get')
    expect(detail?.method).toBe('GET')
    expect(detail?.path).toBe('/v2/groups/{group_openid}/members/{member_openid}')
    expect(detail?.query).toEqual([])

    const remove = getEndpoint('group.batch_remove')
    expect(remove?.method).toBe('POST')
    expect(remove?.path).toBe('/v2/groups/{group_openid}/batch_remove_members')
    expect(remove?.query).toEqual([])
    expect(JSON.parse(remove!.body)).toEqual({ member_openids: [] })

    const blacklistList = getEndpoint('group.blacklist.list')
    expect(blacklistList?.method).toBe('GET')
    expect(blacklistList?.path).toBe('/v2/groups/{group_openid}/member_blacklist')
    expect(blacklistList?.query.map((row) => row.name)).toEqual(['cursor', 'limit'])
    expect(blacklistList?.body).toBe('')

    const blacklistOp = getEndpoint('group.blacklist.set')
    expect(blacklistOp?.method).toBe('POST')
    expect(blacklistOp?.path).toBe('/v2/groups/{group_openid}/member_blacklist')
    expect(blacklistOp?.query).toEqual([])
    expect(JSON.parse(blacklistOp!.body)).toEqual({ op: 'add', member_openids: [] })
  })

  // 素材管理（media-images）：prepare → 预签名 PUT → complete，列表与删除。
  it('lists the material image endpoints', () => {
    const media = CATALOG.filter((endpoint) => endpoint.category === '素材')
    expect(media.map((endpoint) => endpoint.id)).toEqual([
      'media.prepare',
      'media.complete',
      'media.list',
      'media.delete',
    ])
    expect(getEndpoint('media.list')?.query.map((row) => row.name)).toEqual(['cursor'])
    expect(getEndpoint('media.delete')?.pathParams.map((param) => param.name)).toEqual([
      'image_id',
    ])
    expect(JSON.parse(getEndpoint('media.complete')!.body)).toEqual({ upload_id: '', md5: '' })
  })

  // 流式发送单聊消息：同一 stream_msg_id 下按 index 递增分批下发。
  it('lists the streaming c2c message endpoint', () => {
    const endpoint = getEndpoint('c2c.stream_message')
    expect(endpoint?.method).toBe('POST')
    expect(endpoint?.path).toBe('/v2/users/{user_openid}/stream_messages')
    expect(endpoint?.category).toBe('单聊')
    expect(endpoint?.query).toEqual([])
    expect(endpoint?.auth).toBe(true)
    expect(endpoint?.pathParams.map((param) => param.name)).toEqual(['user_openid'])
    expect(JSON.parse(endpoint!.body)).toEqual({
      input_mode: 'replace',
      input_state: 1,
      index: 0,
      content_type: 'markdown',
      content_raw: '正在生成回答，请稍候',
      msg_id: '',
      msg_seq: 1,
    })
  })

  // 2026-11-16 changelog: GET /v2/users/{user_openid}/info.
  it('lists the 2026-11-16 user profile endpoint', () => {
    const endpoint = getEndpoint('user.info')
    expect(endpoint?.method).toBe('GET')
    expect(endpoint?.path).toBe('/v2/users/{user_openid}/info')
    expect(endpoint?.query).toEqual([])
    expect(endpoint?.body).toBe('')
    expect(endpoint?.auth).toBe(true)
    expect(endpoint?.pathParams.map((param) => param.name)).toEqual(['user_openid'])
  })
})
