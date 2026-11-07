<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CATALOG } from '@/lib/apiCatalog'
import type { CatalogEndpoint } from '@/lib/apiCatalog'
import {
  autoEndpointName,
  blankTab,
  makeSaved,
  requestFromTab,
  tabFromEndpoint,
  tabFromSaved,
  validateTab,
  type RequestTab,
} from '@/lib/request'
import {
  app,
  findSaved,
  persistEndpoint,
  removeEndpoint,
  sendRequest,
  toast,
} from '@/stores/app'
import type { SavedEndpoint } from '@/types'
import ApiCatalog from '@/components/ApiCatalog.vue'
import RequestTabs from '@/components/RequestTabs.vue'
import RequestEditor from '@/components/RequestEditor.vue'
import ResponsePanel from '@/components/ResponsePanel.vue'
import Modal from '@/components/Modal.vue'

const initial = CATALOG.find((item) => item.id === 'group.send_message') ?? CATALOG[0]
const tabs = ref<RequestTab[]>([tabFromEndpoint(initial)])
const activeId = ref(tabs.value[0].id)

const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeId.value) ?? tabs.value[0])

const saveOpen = ref(false)
const saveName = ref('')
const saveTargetId = ref<string | null>(null)

function suggestName(tab: RequestTab): string {
  const catalog = CATALOG.find(
    (item) => item.method === tab.method && item.path === tab.path.trim(),
  )
  return catalog?.name ?? autoEndpointName(tab.method, tab.path)
}

function isPristine(tab: RequestTab, endpoint: CatalogEndpoint): boolean {
  return (
    !tab.response &&
    !tab.sending &&
    !tab.savedId &&
    Object.values(tab.pathParams).every((value) => !value) &&
    tab.body === endpoint.body
  )
}

function selectEndpoint(endpoint: CatalogEndpoint) {
  const existing = tabs.value.find(
    (tab) => tab.endpointId === endpoint.id && isPristine(tab, endpoint),
  )
  if (existing) {
    activeId.value = existing.id
    return
  }
  const tab = tabFromEndpoint(endpoint)
  tabs.value.push(tab)
  activeId.value = tab.id
}

function openSaved(saved: SavedEndpoint) {
  const existing = tabs.value.find((tab) => tab.savedId === saved.id)
  if (existing) {
    activeId.value = existing.id
    return
  }
  const tab = tabFromSaved(saved)
  tabs.value.push(tab)
  activeId.value = tab.id
}

function addTab() {
  const tab = blankTab()
  tabs.value.push(tab)
  activeId.value = tab.id
}

function closeTab(id: string) {
  const index = tabs.value.findIndex((tab) => tab.id === id)
  if (index < 0) return
  tabs.value.splice(index, 1)
  if (!tabs.value.length) {
    const tab = blankTab()
    tabs.value.push(tab)
    activeId.value = tab.id
    return
  }
  if (activeId.value === id) {
    const next = tabs.value[Math.min(index, tabs.value.length - 1)]
    activeId.value = next.id
  }
}

async function send() {
  const tab = activeTab.value
  if (!tab || tab.sending) return
  const error = validateTab(tab)
  if (error) {
    tab.error = error
    return
  }
  tab.sending = true
  tab.error = null
  try {
    const response = await sendRequest(requestFromTab(tab))
    if (!tabs.value.includes(tab)) return
    tab.response = response
    if (response.ok && app.settings.autoSaveOnSuccess && !tab.savedId) {
      await autoSave(tab)
    }
  } catch (reason) {
    if (!tabs.value.includes(tab)) return
    tab.response = null
    tab.error = reason instanceof Error ? reason.message : String(reason)
  } finally {
    tab.sending = false
  }
}

async function autoSave(tab: RequestTab) {
  const existing = findSaved(tab.method, tab.path, tab.body)
  if (existing) {
    tab.savedId = existing.id
    tab.savedHint = `已匹配保存的接口「${existing.name}」`
    return
  }
  const endpoint = makeSaved(tab, suggestName(tab))
  const saved = await persistEndpoint(endpoint)
  const created = saved.find((item) => item.id === endpoint.id)
  tab.savedId = created?.id ?? endpoint.id
  tab.title = created?.name ?? endpoint.name
  tab.savedHint = '请求成功，已自动保存接口'
  toast('success', `已自动保存「${created?.name ?? endpoint.name}」`)
}

function openSaveModal() {
  const tab = activeTab.value
  if (!tab) return
  const existing = tab.savedId
    ? app.savedEndpoints.find((item) => item.id === tab.savedId)
    : findSaved(tab.method, tab.path, tab.body)
  saveName.value = existing?.name ?? suggestName(tab)
  saveTargetId.value = tab.savedId
  saveOpen.value = true
}

async function confirmSave() {
  const tab = activeTab.value
  if (!tab) return
  const existing = tab.savedId
    ? app.savedEndpoints.find((item) => item.id === tab.savedId)
    : findSaved(tab.method, tab.path, tab.body)
  const endpoint = makeSaved(tab, saveName.value)
  if (existing) {
    endpoint.id = existing.id
    endpoint.createdAt = existing.createdAt
    endpoint.useCount = (existing.useCount ?? 0) + 1
  }
  try {
    const saved = await persistEndpoint(endpoint)
    const created = saved.find((item) => item.id === endpoint.id)
    tab.savedId = created?.id ?? endpoint.id
    tab.savedHint = '接口已保存'
    tab.title = saveName.value.trim() || tab.title
    saveOpen.value = false
    toast('success', `已保存「${created?.name ?? endpoint.name}」`)
  } catch (reason) {
    toast('error', reason instanceof Error ? reason.message : String(reason))
  }
}

async function deleteSaved(saved: SavedEndpoint) {
  try {
    await removeEndpoint(saved.id)
    for (const tab of tabs.value) {
      if (tab.savedId === saved.id) {
        tab.savedId = null
        tab.savedHint = '已删除已保存接口'
      }
    }
    toast('info', `已删除「${saved.name}」`)
  } catch (reason) {
    toast('error', reason instanceof Error ? reason.message : String(reason))
  }
}

async function deleteActiveSaved() {
  const tab = activeTab.value
  if (!tab?.savedId) return
  const saved = app.savedEndpoints.find((item) => item.id === tab.savedId)
  if (!saved) return
  await deleteSaved(saved)
  tab.savedHint = '已删除已保存接口'
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    void send()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="send-page">
    <ApiCatalog
      :saved="app.savedEndpoints"
      :active-id="activeTab?.endpointId ?? null"
      @select="selectEndpoint"
      @open-saved="openSaved"
      @delete-saved="deleteSaved"
    />

    <div class="workbench">
      <RequestTabs
        :tabs="tabs"
        :active-id="activeId"
        @select="activeId = $event"
        @close="closeTab"
        @add="addTab"
      />

      <div v-if="activeTab" class="editor-area">
        <RequestEditor
          :tab="activeTab"
          :sending="activeTab.sending"
          @send="send"
          @save="openSaveModal"
          @delete-saved="deleteActiveSaved"
        />
        <ResponsePanel
          :response="activeTab.response"
          :error="activeTab.error"
          :sending="activeTab.sending"
        />
      </div>
    </div>

    <Modal v-if="saveOpen" width="520px" @close="saveOpen = false">
      <template #header>保存接口</template>
      <div class="save-form">
        <label class="save-label">
          接口名称
          <input
            v-model="saveName"
            class="input"
            type="text"
            placeholder="例如：群聊发送图片"
            autofocus
            @keydown.enter="confirmSave"
          />
        </label>
        <div class="save-preview">
          <span class="method mono">{{ activeTab?.method }}</span>
          <span class="mono path">{{ activeTab?.path }}</span>
        </div>
        <p class="save-hint">
          已保存接口会出现在接口目录顶部的「已保存接口」中，可随时打开、更新或删除。
        </p>
      </div>
      <template #footer>
        <button class="btn" type="button" @click="saveOpen = false">取消</button>
        <button class="btn primary" type="button" @click="confirmSave">保存</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.send-page {
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.workbench {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: #f7f9fc;
}

.editor-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.save-form {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.save-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
}

.save-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  font-size: 11px;
  min-width: 0;
}

.save-preview .method {
  flex: none;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--accent-2);
  background: var(--accent-soft);
  padding: 1px 5px;
  border-radius: 4px;
}

.save-preview .path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-2);
}

.save-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--ink-3);
}
</style>
