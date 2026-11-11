import { describe, expect, it } from 'vitest'
import {
  applyArkPreset,
  buildMessagePayload,
  createDefaultButton,
  createDefaultDraft,
  detectMessageScene,
  extractReplyCandidates,
  parseMessageDraft,
  validateMessageDraft,
} from './messageBuilder'
import type { GatewayEvent } from '@/types'

describe('detectMessageScene', () => {
  it('detects v2 and guild scenes from API paths and full URLs', () => {
    expect(detectMessageScene('/v2/groups/{group_openid}/messages')).toBe('v2')
    expect(detectMessageScene('/v2/users/{openid}/messages')).toBe('v2')
    expect(detectMessageScene('/channels/{channel_id}/messages')).toBe('guild')
    expect(detectMessageScene('/dms/{guild_id}/messages')).toBe('guild')
    expect(detectMessageScene('https://api.sgroup.qq.com/channels/123/messages?limit=1')).toBe(
      'guild',
    )
  })
})

describe('buildMessagePayload', () => {
  it('builds a proactive v2 text payload omitting empty msg_id and msg_seq', () => {
    const draft = createDefaultDraft('v2')
    draft.content = '你好'
    expect(buildMessagePayload(draft)).toEqual({
      content: '你好',
      msg_type: 0,
    })
  })

  it('includes msg_id, msg_seq, and message_reference when passively replying in v2', () => {
    const draft = createDefaultDraft('v2')
    draft.content = '收到'
    draft.msgId = 'msg_abc'
    draft.msgSeq = 3
    draft.refMessageId = 'msg_abc'
    draft.refIgnoreError = true

    expect(buildMessagePayload(draft)).toEqual({
      content: '收到',
      msg_type: 0,
      msg_id: 'msg_abc',
      msg_seq: 3,
      message_reference: {
        message_id: 'msg_abc',
        ignore_get_message_error: true,
      },
    })
  })

  it('builds markdown + custom keyboard without leaking text content', () => {
    const draft = createDefaultDraft('v2')
    draft.kind = 'markdown'
    draft.markdownMode = 'content'
    draft.markdownContent = '# 标题'
    draft.keyboardMode = 'custom'
    const btn = createDefaultButton(1)
    btn.label = '确认'
    btn.visitedLabel = '已确认'
    btn.permissionType = 0
    btn.specifyUserIds = ['USER_1']
    draft.keyboardRows = [{ buttons: [btn] }]

    const payload = buildMessagePayload(draft)
    expect(payload.msg_type).toBe(2)
    expect(payload.content).toBeUndefined()
    expect(payload.markdown).toEqual({ content: '# 标题' })
    expect(payload.keyboard).toEqual({
      content: {
        rows: [
          {
            buttons: [
              {
                id: '1',
                render_data: {
                  label: '确认',
                  visited_label: '已确认',
                  style: 1,
                },
                action: {
                  type: 2,
                  permission: {
                    type: 0,
                    specify_user_ids: ['USER_1'],
                  },
                  data: '/ping',
                  enter: true,
                  unsupport_tips: '当前客户端版本暂不支持该操作',
                },
              },
            ],
          },
        ],
      },
    })
  })

  it('builds markdown template, media, ark, and embed payloads', () => {
    const draft = createDefaultDraft('v2')

    draft.kind = 'markdown'
    draft.markdownMode = 'template'
    draft.markdownTemplateId = 'tpl_100'
    draft.markdownParams = [{ key: 'title', values: ['欢迎'] }]
    expect(buildMessagePayload(draft)).toEqual({
      msg_type: 2,
      markdown: {
        custom_template_id: 'tpl_100',
        params: [{ key: 'title', values: ['欢迎'] }],
      },
    })

    draft.kind = 'media'
    draft.fileInfo = 'FILE_INFO_TOKEN'
    draft.mediaContent = '看图'
    expect(buildMessagePayload(draft)).toEqual({
      msg_type: 7,
      media: { file_info: 'FILE_INFO_TOKEN' },
      content: '看图',
    })

    draft.kind = 'ark'
    applyArkPreset(draft, 24)
    const arkPayload = buildMessagePayload(draft)
    expect(arkPayload.msg_type).toBe(3)
    expect((arkPayload.ark as { template_id: number }).template_id).toBe(24)

    draft.kind = 'embed'
    draft.embedTitle = '标题'
    draft.embedPrompt = '摘要'
    draft.embedThumbnail = 'https://example.com/a.png'
    draft.embedFields = ['第一行', '']
    expect(buildMessagePayload(draft)).toEqual({
      msg_type: 4,
      embed: {
        title: '标题',
        prompt: '摘要',
        thumbnail: { url: 'https://example.com/a.png' },
        fields: [{ name: '第一行' }],
      },
    })
  })

  it('builds guild payloads without msg_type or msg_seq', () => {
    const draft = createDefaultDraft('guild')
    draft.kind = 'text'
    draft.content = '频道消息'
    draft.imageUrl = 'https://example.com/pic.png'
    draft.msgId = 'guild_msg_1'

    expect(buildMessagePayload(draft)).toEqual({
      content: '频道消息',
      image: 'https://example.com/pic.png',
      msg_id: 'guild_msg_1',
    })
  })
})

describe('parseMessageDraft & diagnostics', () => {
  it('hydrates existing catalog template and round-trips extra top-level fields', () => {
    const raw = JSON.stringify({
      msg_type: 2,
      markdown: {
        custom_template_id: 'tpl_99',
        params: [{ key: 'k1', values: ['v1', 'v2'] }],
      },
      keyboard: { id: 'kb_88' },
      msg_id: 'm_1',
      msg_seq: 4,
      custom_flag: true,
    })

    const { draft, notice } = parseMessageDraft(raw, '/v2/groups/{group_openid}/messages')
    expect(notice).toBeNull()
    expect(draft.kind).toBe('markdown')
    expect(draft.markdownMode).toBe('template')
    expect(draft.markdownTemplateId).toBe('tpl_99')
    expect(draft.markdownParams).toEqual([{ key: 'k1', values: ['v1', 'v2'] }])
    expect(draft.keyboardMode).toBe('template')
    expect(draft.keyboardId).toBe('kb_88')
    expect(draft.msgId).toBe('m_1')
    expect(draft.msgSeq).toBe(4)

    const rebuilt = buildMessagePayload(draft)
    expect(rebuilt.custom_flag).toBe(true)
    expect(rebuilt.keyboard).toEqual({ id: 'kb_88' })
  })

  it('warns without polluting extra fields when body is malformed or non-message JSON', () => {
    const malformed = parseMessageDraft('{bad', '/v2/groups/x/messages')
    expect(malformed.notice).toContain('不是合法 JSON')
    expect(malformed.draft.extra).toEqual({})

    const uploadBody = parseMessageDraft(
      '{"file_type": 1, "url": "https://example.com/a.png"}',
      '/v2/groups/x/files',
    )
    expect(uploadBody.notice).toContain('不包含消息字段')
    expect(uploadBody.draft.extra).toEqual({})
  })

  it('reports missing required fields in validateMessageDraft', () => {
    const draft = createDefaultDraft('v2')
    draft.kind = 'media'
    draft.fileInfo = ''
    const warnings = validateMessageDraft(draft)
    expect(warnings.some((item) => item.level === 'warning' && item.message.includes('file_info'))).toBe(
      true,
    )
  })
})

describe('extractReplyCandidates', () => {
  it('extracts msg_id from message events and event_id from lifecycle events', () => {
    const events: GatewayEvent[] = [
      {
        id: 'evt_msg_1',
        seq: 1,
        type: 'GROUP_AT_MESSAGE_CREATE',
        receivedAt: '2026-11-11T10:00:00.000Z',
        data: { id: 'qq_msg_001', content: '你好' },
      },
      {
        id: 'GROUP_ADD_ROBOT:xyz',
        seq: 2,
        type: 'GROUP_ADD_ROBOT',
        receivedAt: '2026-11-11T10:01:00.000Z',
        data: { group_openid: 'g1' },
      },
    ]

    const list = extractReplyCandidates(events)
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ targetKind: 'msg_id', targetId: 'qq_msg_001' })
    expect(list[1]).toMatchObject({ targetKind: 'event_id', targetId: 'GROUP_ADD_ROBOT:xyz' })
  })
})
