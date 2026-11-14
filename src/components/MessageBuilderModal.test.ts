import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import MessageBuilderModal from './MessageBuilderModal.vue'
import type { MessageScope } from '@/lib/messageBuilder'

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
      .find('input[placeholder="事件里的消息 ID，主动消息留空"]')
      .setValue('MSG_1')

    await button(wrapper, '填入请求体')!.trigger('click')

    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({
      content: '你好',
      msg_type: 0,
      msg_id: 'MSG_1',
      msg_seq: 1,
    })
  })

  it('builds a markdown message from template params', async () => {
    const wrapper = mountModal('group', '{"content": ""}')

    await button(wrapper, 'Markdown')!.trigger('click')
    await wrapper
      .find('input[placeholder="开放平台申请的 Markdown 模板 ID"]')
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

  it('previews the body live', async () => {
    const wrapper = mountModal('group', '{"content": ""}')

    await wrapper.find('textarea.content-input').setValue('实时预览')
    expect(wrapper.find('.preview-body').text()).toContain('实时预览')
    expect(wrapper.find('.preview-body').text()).toContain('"msg_type": 0')
  })
})
