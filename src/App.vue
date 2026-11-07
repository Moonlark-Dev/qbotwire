<script setup lang="ts">
import { onMounted } from 'vue'
import { app, bootstrap } from '@/stores/app'
import BrandMark from '@/components/BrandMark.vue'
import Onboarding from '@/components/Onboarding.vue'
import MainShell from '@/components/MainShell.vue'
import ToastStack from '@/components/ToastStack.vue'
import { AlertTriangle, RefreshCw } from 'lucide-vue-next'

onMounted(() => {
  void bootstrap()
})

function reload() {
  window.location.reload()
}
</script>

<template>
  <div class="app-root">
    <div v-if="!app.ready" class="boot">
      <div class="boot-glow" />
      <BrandMark :size="58" glow />
      <h1>QBotWire</h1>
      <p>正在启动工作台…</p>
      <span class="boot-loader" />
    </div>

    <div v-else-if="app.fatal" class="fatal">
      <div class="fatal-card">
        <AlertTriangle :size="26" class="fatal-icon" />
        <h1>启动失败</h1>
        <p>qbotwire 无法初始化本地后端。</p>
        <pre class="fatal-message">{{ app.fatal }}</pre>
        <button class="btn primary" type="button" @click="reload">
          <RefreshCw :size="14" /> 重新加载
        </button>
      </div>
    </div>

    <Onboarding v-else-if="!app.credentials" />

    <MainShell v-else />

    <ToastStack />
  </div>
</template>

<style scoped>
.app-root {
  height: 100%;
}

.boot {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  overflow: hidden;
}

.boot-glow {
  position: absolute;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(120, 165, 255, 0.28), transparent 65%);
  filter: blur(20px);
  animation: breathe 3.5s ease-in-out infinite;
}

.boot h1 {
  margin: 4px 0 0;
  font-size: 21px;
  letter-spacing: 0.02em;
}

.boot p {
  margin: 0;
  font-size: 11.5px;
  color: var(--ink-3);
}

.boot-loader {
  width: 20px;
  height: 20px;
  margin-top: 8px;
  border: 2px solid #dbe4f3;
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.85s linear infinite;
}

@keyframes breathe {
  50% {
    transform: scale(1.08);
    opacity: 0.7;
  }
}

.fatal {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.fatal-card {
  width: min(560px, 100%);
  padding: 26px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.fatal-icon {
  color: var(--amber);
}

.fatal-card h1 {
  margin: 0;
  font-size: 17px;
}

.fatal-card p {
  margin: 0;
  font-size: 12px;
  color: var(--ink-2);
}

.fatal-message {
  width: 100%;
  margin: 2px 0 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 10.5px;
  white-space: pre-wrap;
  color: #b42318;
  max-height: 180px;
  overflow: auto;
}
</style>
