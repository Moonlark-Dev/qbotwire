import { describe, expect, it } from 'vitest'
import {
  buildMessageBody,
  emptyDraft,
  messageScopeForPath,
  parseMessageBody,
  validateMessageDraft,
  type MessageDraft,
} from './messageBuilder'

function draft(patch: Partial<MessageDraft> = {}): MessageDraft {
  return { ...emptyDraft(), ...patch }
}

describe('buildMessageBody', () => {
  it('builds a text message and only includes a passive reply when msg_id is set', () => {
    expect(buildMessageBody(draft({ content: 'hi' }), 'group')).toEqual({
      content: 'hi',
      msg_type: 0,
    })

    expect(
      buildMessageBody(draft({ content: 'hi', msgId: 'MSG_1', msgSeq: '2' }), 'group'),
    ).toEqual({ content: 'hi', msg_type: 0, msg_id: 'MSG_1', msg_seq: 2 })
  })

  it('drops msg_seq for channel and DM replies', () => {
    const body = buildMessageBody(draft({ content: 'hi', msgId: 'MSG_1', msgSeq: '3' }), 'channel')
    expect(body).toEqual({ content: 'hi', msg_type: 0, msg_id: 'MSG_1' })
  })

  it('builds markdown params and ignores empty keys', () => {
    const body = buildMessageBody(
      draft({
        kind: 'markdown',
        content: '',
        markdownTemplateId: ' tpl-1 ',
        markdownParams: [
          { key: 'title', values: 'a，b, c' },
          { key: '', values: 'ignored' },
        ],
      }),
      'group',
    )

    expect(body).toEqual({
      msg_type: 2,
      markdown: {
        custom_template_id: 'tpl-1',
        params: [{ key: 'title', values: ['a', 'b', 'c'] }],
      },
    })
  })

  it('builds ark with a numeric template id and kv rows', () => {
    const body = buildMessageBody(
      draft({
        kind: 'ark',
        content: '',
        arkTemplateId: '23',
        arkKv: [
          { key: 'title', value: '标题' },
          { key: '', value: 'ignored' },
        ],
      }),
      'group',
    )

    expect(body).toEqual({
      msg_type: 3,
      ark: { template_id: 23, kv: [{ key: 'title', value: '标题' }] },
    })
  })

  it('builds embed and omits empty prompt / thumbnail', () => {
    const body = buildMessageBody(
      draft({
        kind: 'embed',
        content: '',
        embedTitle: '卡片',
        embedFields: [{ name: '状态', value: '已上线' }],
      }),
      'channel',
    )

    expect(body).toEqual({
      msg_type: 4,
      embed: { title: '卡片', fields: [{ name: '状态', value: '已上线' }] },
    })
  })

  it('builds media, message references and keyboard', () => {
    const keyboard = { content: { rows: [] } }
    const body = buildMessageBody(
      draft({
        kind: 'media',
        content: '',
        mediaFileInfo: 'FILE_INFO',
        msgId: 'MSG_9',
        msgSeq: '1',
        referenceId: 'REF_1',
        ignoreReferenceError: true,
        keyboardJson: JSON.stringify(keyboard),
      }),
      'c2c',
    )

    expect(body).toEqual({
      msg_type: 7,
      media: { file_info: 'FILE_INFO' },
      msg_id: 'MSG_9',
      msg_seq: 1,
      message_reference: { message_id: 'REF_1', ignore_get_message_error: true },
      keyboard,
    })
  })
})

describe('parseMessageBody', () => {
  it('round-trips a built markdown body', () => {
    const built = buildMessageBody(
      draft({
        kind: 'markdown',
        content: 'fallback',
        markdownTemplateId: 'tpl-1',
        markdownParams: [{ key: 'title', values: 'a，b' }],
        msgId: 'MSG_1',
        msgSeq: '2',
      }),
      'group',
    )
    const parsed = parseMessageBody(JSON.stringify(built))

    expect(parsed.kind).toBe('markdown')
    expect(parsed.markdownTemplateId).toBe('tpl-1')
    expect(parsed.markdownParams).toEqual([{ key: 'title', values: 'a，b' }])
    expect(parsed.msgId).toBe('MSG_1')
    expect(parsed.msgSeq).toBe('2')
  })

  it('detects the kind from the payload even when msg_type is missing', () => {
    expect(parseMessageBody(JSON.stringify({ embed: { title: 't' } })).kind).toBe('embed')
    expect(parseMessageBody(JSON.stringify({ media: { file_info: 'f' } })).kind).toBe('media')
  })

  it('falls back to an empty text draft for empty or invalid bodies', () => {
    expect(parseMessageBody('')).toEqual(emptyDraft())

    const parsed = parseMessageBody('{ not json')
    expect(parsed.kind).toBe('text')
    expect(parsed.content).toBe('你好，QBotWire')
  })

  it('prefills keyboard JSON pretty-printed', () => {
    const parsed = parseMessageBody(
      JSON.stringify({ content: 'hi', keyboard: { content: { rows: [] } } }),
    )
    expect(JSON.parse(parsed.keyboardJson)).toEqual({ content: { rows: [] } })
  })
})

describe('validateMessageDraft', () => {
  it('requires content for text and template ids for markdown / ark', () => {
    expect(validateMessageDraft(draft({ content: '' }), 'group')).toContain('content')
    expect(validateMessageDraft(draft({ kind: 'markdown', content: '' }), 'group')).toContain(
      'custom_template_id',
    )
    expect(validateMessageDraft(draft({ kind: 'ark', content: '' }), 'group')).toContain(
      'template_id',
    )
    expect(
      validateMessageDraft(draft({ kind: 'ark', content: '', arkTemplateId: 'abc' }), 'group'),
    ).toContain('整数')
  })

  it('requires an embed title and media file_info', () => {
    expect(validateMessageDraft(draft({ kind: 'embed', content: '' }), 'group')).toContain('标题')
    expect(validateMessageDraft(draft({ kind: 'media', content: '' }), 'group')).toContain(
      'file_info',
    )
    expect(validateMessageDraft(draft({ kind: 'media', content: '' }), 'channel')).toContain(
      '只支持群聊',
    )
  })

  it('rejects broken keyboard JSON and a non-integer msg_seq', () => {
    expect(validateMessageDraft(draft({ content: 'hi', keyboardJson: '{' }), 'group')).toContain(
      '按钮 JSON',
    )
    expect(
      validateMessageDraft(draft({ content: 'hi', msgId: 'MSG_1', msgSeq: '0' }), 'group'),
    ).toContain('msg_seq')
  })

  it('accepts a complete draft', () => {
    expect(validateMessageDraft(draft({ content: 'hi', msgId: 'MSG_1' }), 'group')).toBeNull()
  })
})

describe('messageScopeForPath', () => {
  it('recognises every send-message endpoint', () => {
    expect(messageScopeForPath('POST', '/v2/groups/{group_openid}/messages')).toBe('group')
    expect(messageScopeForPath('post', '/v2/users/{openid}/messages')).toBe('c2c')
    expect(messageScopeForPath('POST', '/channels/{channel_id}/messages')).toBe('channel')
    expect(messageScopeForPath('POST', '/dms/{guild_id}/messages')).toBe('dm')
  })

  it('accepts full URLs and rejects other requests', () => {
    expect(
      messageScopeForPath('POST', 'https://api.sgroup.qq.com/v2/groups/G1/messages?x=1'),
    ).toBe('group')
    expect(messageScopeForPath('GET', '/v2/groups/G1/messages')).toBeNull()
    expect(messageScopeForPath('POST', '/v2/groups/{group_openid}/files')).toBeNull()
  })
})
