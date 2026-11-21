import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MediaPage from './MediaPage.vue'
import { app } from '@/stores/app'
import type { Credentials, MediaAsset } from '@/types'

const credentials: Credentials = {
  appId: '102030405',
  clientSecret: 'secret-123',
  environment: 'production',
  intents: 1 << 25,
}

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    imageId: '102030405_kline',
    url: 'qqbot-media://image/v1/token-1',
    fileName: 'kline.png',
    contentType: 'image/png',
    size: 40156,
    width: 800,
    height: 400,
    thumbnail: null,
    appId: credentials.appId,
    createdAt: Math.floor(Date.now() / 1000) - 60,
    expiresAt: Math.floor(Date.now() / 1000) + 86_400 * 30,
    source: 'upload',
    ...overrides,
  }
}

describe('MediaPage', () => {
  beforeEach(() => {
    app.credentials = credentials
    app.mediaAssets = [asset()]
  })

  afterEach(() => {
    app.credentials = null
    app.mediaAssets = []
  })

  it('lists cached assets for the current bot and hides other apps', () => {
    app.mediaAssets = [
      asset(),
      asset({ imageId: 'other', appId: '999', fileName: 'other.png' }),
    ]
    const wrapper = mount(MediaPage)
    expect(wrapper.findAll('.card')).toHaveLength(1)
    expect(wrapper.text()).toContain('kline.png')
    expect(wrapper.text()).toContain('1 张缓存')
  })

  it('filters by file name and shows the empty state', async () => {
    const wrapper = mount(MediaPage)
    await wrapper.find('input.search').setValue('cover')
    expect(wrapper.findAll('.card')).toHaveLength(0)
    expect(wrapper.text()).toContain('没有匹配的素材')
  })

  it('opens the cached link detail with Markdown actions', async () => {
    const wrapper = mount(MediaPage, { global: { stubs: { teleport: true } } })
    await wrapper.find('.card').trigger('click')
    const text = wrapper.text()
    expect(text).toContain('Markdown 引用')
    expect(text).toContain('qqbot-media://image/v1/token-1')
    expect(text).toContain('复制 Markdown')
    expect(text).toContain('从平台删除')
  })

  it('marks expired links', () => {
    app.mediaAssets = [asset({ expiresAt: Math.floor(Date.now() / 1000) - 60 })]
    const wrapper = mount(MediaPage)
    expect(wrapper.find('.card').classes()).toContain('expired')
    expect(wrapper.text()).toContain('1 张已过期')
  })
})
