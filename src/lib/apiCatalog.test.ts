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
})
