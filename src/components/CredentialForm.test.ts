import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CredentialForm from './CredentialForm.vue'
import type { Credentials } from '@/types'

async function fillBasic(wrapper: ReturnType<typeof mount>) {
  const inputs = wrapper.findAll('input')
  await inputs[0].setValue('123456789')
  await inputs[1].setValue('secret-123')
}

describe('CredentialForm', () => {
  it('emits valid credentials with the default environment', async () => {
    const wrapper = mount(CredentialForm, { props: { mode: 'tauri' } })
    await fillBasic(wrapper)
    await wrapper.find('form').trigger('submit')
    const events = wrapper.emitted('submit')
    expect(events).toHaveLength(1)
    const credentials = events![0][0] as Credentials
    expect(credentials.appId).toBe('123456789')
    expect(credentials.clientSecret).toBe('secret-123')
    expect(credentials.environment).toBe('production')
    expect(credentials.intents).toBe(1 << 25)
    expect(credentials.baseUrl).toBeNull()
  })

  it('rejects an invalid app id without emitting', async () => {
    const wrapper = mount(CredentialForm, { props: { mode: 'tauri' } })
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('abc')
    await inputs[1].setValue('secret-123')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('AppID')
  })

  it('requires a base url for the custom environment', async () => {
    const wrapper = mount(CredentialForm, { props: { mode: 'tauri' } })
    await fillBasic(wrapper)
    const custom = wrapper
      .findAll('button')
      .find((button) => button.text().includes('自定义'))
    expect(custom).toBeTruthy()
    await custom!.trigger('click')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('Base URL')
    expect(wrapper.emitted('submit')).toBeUndefined()

    const baseInput = wrapper
      .findAll('input')
      .find((input) => (input.element as HTMLInputElement).placeholder.includes('127.0.0.1'))
    expect(baseInput).toBeTruthy()
    await baseInput!.setValue('http://127.0.0.1:5700/')
    await wrapper.find('form').trigger('submit')
    const events = wrapper.emitted('submit')
    expect(events).toHaveLength(1)
    const credentials = events![0][0] as Credentials
    expect(credentials.environment).toBe('custom')
    expect(credentials.baseUrl).toBe('http://127.0.0.1:5700')
  })

  it('prefills demo credentials in preview mode', async () => {
    const wrapper = mount(CredentialForm, { props: { mode: 'mock' } })
    const demo = wrapper
      .findAll('button')
      .find((button) => button.text().includes('填入演示凭据'))
    await demo!.trigger('click')
    const inputs = wrapper.findAll('input')
    expect((inputs[0].element as HTMLInputElement).value).toBe('102030405')
    expect((inputs[1].element as HTMLInputElement).value).toBe('qbotwire-demo-secret')
  })
})
