import { describe, expect, it } from 'vitest'
import {
  applyPathParams,
  autoEndpointName,
  blankTab,
  makeSaved,
  missingPathParams,
  pathParamNames,
  requestFromTab,
  tabFromEndpoint,
  tabFromSaved,
  validateTab,
} from './request'
import { getEndpoint } from './apiCatalog'

const groupSend = getEndpoint('group.send_message')!

describe('path parameters', () => {
  it('extracts placeholders in order', () => {
    expect(pathParamNames('/v2/groups/{group_openid}/messages/{message_id}')).toEqual([
      'group_openid',
      'message_id',
    ])
  })

  it('replaces and url-encodes values', () => {
    expect(
      applyPathParams('/v2/groups/{group_openid}/messages', {
        group_openid: 'group/1',
      }),
    ).toBe('/v2/groups/group%2F1/messages')
  })

  it('keeps unfilled placeholders so validation can report them', () => {
    expect(applyPathParams('/x/{id}', {})).toBe('/x/{id}')
    expect(missingPathParams('/x/{id}', {})).toEqual(['id'])
  })
})

describe('request tabs', () => {
  it('creates a tab from a catalog endpoint', () => {
    const tab = tabFromEndpoint(groupSend)
    expect(tab.endpointId).toBe(groupSend.id)
    expect(tab.custom).toBe(false)
    expect(tab.path).toBe(groupSend.path)
    expect(tab.query).toEqual([])
    expect(tab.response).toBeNull()
    expect(tab.body).toContain('"content"')
  })

  it('creates an empty custom tab', () => {
    const tab = blankTab()
    expect(tab.custom).toBe(true)
    expect(tab.endpointId).toBeNull()
    expect(tab.method).toBe('GET')
  })

  it('validates missing path params and malformed JSON', () => {
    const tab = tabFromEndpoint(groupSend)
    expect(validateTab(tab)).toContain('group_openid')
    tab.pathParams.group_openid = 'g-1'
    tab.body = '{not json'
    expect(validateTab(tab)).toContain('JSON')
    tab.body = '{"content":"hi"}'
    expect(validateTab(tab)).toBeNull()
  })

  it('builds an API request from a tab', () => {
    const tab = tabFromEndpoint(groupSend)
    tab.pathParams.group_openid = 'g-1'
    tab.query = [{ key: 'limit', value: '10', enabled: true }, { key: 'skip', value: 'x', enabled: false }]
    const request = requestFromTab(tab)
    expect(request.path).toBe('/v2/groups/g-1/messages')
    expect(request.query).toEqual([{ key: 'limit', value: '10', enabled: true }])
  })

  it('round-trips a saved endpoint', () => {
    const tab = tabFromEndpoint(groupSend)
    tab.pathParams.group_openid = 'g-1'
    const saved = makeSaved(tab, '发送群消息')
    expect(saved.name).toBe('发送群消息')
    expect(saved.method).toBe('POST')
    const restored = tabFromSaved(saved)
    expect(restored.savedId).toBe(saved.id)
    expect(restored.title).toBe('发送群消息')
    expect(restored.body).toBe(saved.body)
  })

  it('derives a readable fallback name', () => {
    expect(autoEndpointName('post', '/v2/groups/{group_openid}/messages')).toBe(
      'POST /{group_openid}/messages',
    )
  })
})
