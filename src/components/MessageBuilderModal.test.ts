import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import MessageBuilderModal from './MessageBuilderModal.vue'
import { app } from '@/stores/app'
import type { MessageScope } from '@/lib/messageBuilder'
import type { MediaAsset } from '@/types'

const wrappers: VueWrapper[] = []

function mountModal(scope: MessageScope = 'group', body = '') {
  const wrapper = mount(MessageBuilderModal, {
    props: { scope, body },
    global: { stubs: { teleport: true } },
  })
  wrappers.push(wrapper)
  return wrapper
}

function button(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((item) => item.text().includes(text))
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('MessageBuilderModal', () => {
  it('defaults to a text message and emits the built body', async () => {
    const wrapper = mountModal('group')

    expect(wrapper.find('.kind-tab.active').text()).toContain('文本')
    await wrapper.find('textarea.content-input').setValue('你好')
    await wrapper
      .find('input[placeholder="群消息事件里的消息 ID"]')
      .setValue('MSG_1')

    await button(wrapper, '填入请求体')!.trigger('click')

    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({
      content: '你好',
      msg_type: 0,
      msg_id: 'MSG_1',
      msg_seq: 1,
    })
  })

  it('builds a native markdown message without a template', async () => {
    const wrapper = mountModal('group', '{"content": ""}')

    await button(wrapper, 'Markdown')!.trigger('click')
    expect(wrapper.find('.mode-tab.active').text()).toContain('自定义内容')

    await wrapper.find('textarea.markdown-input').setValue('## 标题\n\n正文 **加粗**')

    await button(wrapper, '填入请求体')!.trigger('click')

    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({
      msg_type: 2,
      markdown: { content: '## 标题\n\n正文 **加粗**' },
    })
  })

  it('still builds a legacy markdown template message', async () => {
    const wrapper = mountModal('group', '{"content": ""}')

    await button(wrapper, 'Markdown')!.trigger('click')
    await button(wrapper, '模板（旧）')!.trigger('click')
    await wrapper
      .find('input[placeholder="旧版 Markdown 模板 ID"]')
      .setValue('tpl-1')
    await button(wrapper, '添加参数')!.trigger('click')

    const inputs = wrapper.findAll('.row-inputs input')
    await inputs[0].setValue('title')
    await inputs[1].setValue('a，b')

    await button(wrapper, '填入请求体')!.trigger('click')

    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({
      msg_type: 2,
      markdown: {
        custom_template_id: 'tpl-1',
        params: [{ key: 'title', values: ['a', 'b'] }],
      },
    })
  })

  it('prefills native markdown content from an existing body', () => {
    const wrapper = mountModal(
      'group',
      JSON.stringify({ msg_type: 2, markdown: { content: '# 已有内容' } }),
    )

    expect(wrapper.find('.kind-tab.active').text()).toContain('Markdown')
    expect(
      (wrapper.find('textarea.markdown-input').element as HTMLTextAreaElement).value,
    ).toBe('# 已有内容')
  })

  it('prefills an existing embed body and hides rich media on channel messages', async () => {
    const wrapper = mountModal(
      'channel',
      JSON.stringify({ msg_type: 4, embed: { title: '已有标题', prompt: '描述' } }),
    )

    expect(wrapper.find('.kind-tab.active').text()).toContain('Embed')
    expect(
      (wrapper.find('input[placeholder="卡片标题"]').element as HTMLInputElement).value,
    ).toBe('已有标题')
    expect(
      wrapper.findAll('.kind-tab').some((tab) => tab.text().includes('富媒体')),
    ).toBe(false)
  })

  it('blocks applying while the keyboard JSON is invalid', async () => {
    const wrapper = mountModal('group')

    await wrapper.find('textarea.keyboard-input').setValue('{')

    expect(wrapper.find('.field-error').text()).toContain('按钮 JSON')
    expect(button(wrapper, '填入请求体')!.attributes('disabled')).toBeDefined()
  })


  it('shows the 2026-11-17 passive-reply rules for each scope', () => {
    const group = mountModal('group')
    expect(group.text()).toContain('60 分钟内')
    expect(group.text()).toContain('50 次')
    expect(group.text()).toContain('发送单聊消息')

    const c2c = mountModal('c2c')
    expect(c2c.text()).toContain('4 次')
    expect(c2c.text()).toContain('群消息的 msg_id')
    expect(
      c2c.find('input[placeholder="单聊消息 ID，或群消息 ID（私聊回复发送者）"]').exists(),
    ).toBe(true)
  })

  it('quick-inserts a cached material image into markdown', async () => {
    const asset: MediaAsset = {
      imageId: '102030405_kline',
      url: 'qqbot-media://image/v1/token-1',
      fileName: 'kline.png',
      contentType: 'image/png',
      size: 40156,
      width: 800,
      height: 400,
      thumbnail: null,
      appId: '102030405',
      createdAt: 1_790_000_000,
      expiresAt: 1_797_776_000,
      source: 'upload',
    }
    app.credentials = {
      appId: '102030405',
      clientSecret: 'secret-123',
      environment: 'production',
      intents: 1 << 25,
    }
    app.mediaAssets = [asset]

    const wrapper = mountModal('group', '{"content": ""}')
    await button(wrapper, 'Markdown')!.trigger('click')
    await wrapper.find('textarea.markdown-input').setValue('## 行情')

    await button(wrapper, '插入素材')!.trigger('click')
    const sizeInputs = wrapper.findAll('.size-field input')
    await sizeInputs[0].setValue('800')
    await sizeInputs[1].setValue('400')
    const card = wrapper.find('.picker-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('kline.png')
    await card.trigger('click')

    const value = (wrapper.find('textarea.markdown-input').element as HTMLTextAreaElement).value
    expect(value).toBe(
      '## 行情![kline.png #800px #400px](qqbot-media://image/v1/token-1)',
    )

    await button(wrapper, '填入请求体')!.trigger('click')
    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({
      msg_type: 2,
      markdown: { content: value },
    })

    app.credentials = null
    app.mediaAssets = []
  })

  it('previews the body live', async () => {
    const wrapper = mountModal('group', '{"content": ""}')

    await wrapper.find('textarea.content-input').setValue('实时预览')
    expect(wrapper.find('.preview-body').text()).toContain('实时预览')
    expect(wrapper.find('.preview-body').text()).toContain('"msg_type": 0')
  })
})
