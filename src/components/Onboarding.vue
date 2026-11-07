<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink } from 'lucide-vue-next'
import BrandMark from '@/components/BrandMark.vue'
import CredentialForm from '@/components/CredentialForm.vue'
import { app, login, toast } from '@/stores/app'
import type { Credentials } from '@/types'

const busy = ref(false)
const error = ref<string | null>(null)

async function onConnect(credentials: Credentials) {
  busy.value = true
  error.value = null
  try {
    await login(credentials)
    toast('success', '已连接 QQ Bot 网关')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="onboarding">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <header class="dialog-head">
        <BrandMark :size="28" />
        <div class="brand-text">
          <strong>QBotWire</strong>
          <span>QQ Bot API 调试台</span>
        </div>
        <span class="badge">首次设置</span>
      </header>

      <div class="dialog-body">
        <div class="title-block">
          <h1 id="onboarding-title">连接你的 Bot</h1>
          <p>
            填写 QQ 开放平台的机器人凭据，qbotwire 会换取 AccessToken 并保持网关连接。
            凭据只会保存在本机。
          </p>
        </div>

        <CredentialForm
          :busy="busy"
          :error="error"
          :mode="app.mode"
          submit-label="连接并保存"
          @submit="onConnect"
        />
      </div>

      <footer class="dialog-foot">
        <a href="https://bot.q.qq.com/wiki/develop/api-v2/" target="_blank" rel="noreferrer">
          QQ Bot API 文档
          <ExternalLink :size="10" />
        </a>
        <span>AGPL-3.0 · Moonlark · {{ app.mode === 'mock' ? '预览版' : `v${app.version}` }}</span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.onboarding {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
  background:
    radial-gradient(760px 500px at 78% 0%, #dfeaff 0%, transparent 62%),
    radial-gradient(620px 460px at 8% 100%, #e7e2ff 0%, transparent 56%),
    #eef2f8;
}

.dialog {
  width: min(620px, 100%);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 16px;
  box-shadow: 0 24px 70px rgba(20, 40, 90, 0.18), 0 2px 8px rgba(20, 40, 90, 0.06);
  overflow: hidden;
  animation: pop-in 0.2s ease;
}

.dialog-head {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 60px;
  padding: 0 22px;
  border-bottom: 1px solid var(--line);
  background: var(--panel-2);
  flex: none;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.brand-text strong {
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.brand-text span {
  font-size: 9px;
  color: var(--ink-3);
  letter-spacing: 0.04em;
}

.badge {
  margin-left: auto;
  font-size: 9.5px;
  font-weight: 600;
  color: var(--accent-2);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  padding: 2px 8px;
  border-radius: 999px;
}

.dialog-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 22px 26px 24px;
}

.title-block {
  margin-bottom: 18px;
}

.title-block h1 {
  margin: 0 0 5px;
  font-size: 20px;
  font-weight: 720;
  letter-spacing: -0.015em;
  color: var(--ink);
}

.title-block p {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-3);
}

.dialog-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 26px;
  border-top: 1px solid var(--line);
  background: var(--panel-2);
  font-size: 10px;
  color: var(--ink-3);
  flex: none;
}

.dialog-foot a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ink-2);
  font-size: 10px;
}

.dialog-foot a:hover {
  color: var(--accent);
}

@media (max-height: 720px) {
  .dialog-body {
    padding: 16px 22px 18px;
  }
  .title-block {
    margin-bottom: 12px;
  }
}
</style>
