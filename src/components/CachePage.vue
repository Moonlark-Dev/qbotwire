<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  app,
  clearCache,
  refreshCache,
  refreshGroup,
  renameCacheEntry,
  toast,
} from '@/stores/app'
import { formatDateTime, formatRelative } from '@/lib/format'
import Avatar from './Avatar.vue'
import Modal from './Modal.vue'
import {
  Database,
  Copy,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-vue-next'

type CacheKind = 'group' | 'user'

interface Detail {
  kind: CacheKind
  openid: string
}

const kind = ref<CacheKind>('group')
const search = ref('')
const detail = ref<Detail | null>(null)
const draftName = ref('')
const refreshing = ref(false)
const confirmClear = ref<CacheKind | 'all' | null>(null)

const groups = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return app.cache.groups.filter(
    (group) =>
      !needle ||
      group.openid.toLowerCase().includes(needle) ||
      (group.name ?? '').toLowerCase().includes(needle),
  )
})

const users = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return app.cache.users.filter(
    (user) =>
      !needle ||
      user.openid.toLowerCase().includes(needle) ||
      (user.name ?? '').toLowerCase().includes(needle),
  )
})

const current = computed(() => (kind.value === 'group' ? groups.value : users.value))

const selectedEntry = computed(() => {
  if (!detail.value) return null
  return detail.value.kind === 'group'
    ? app.cache.groups.find((item) => item.openid === detail.value?.openid) ?? null
    : app.cache.users.find((item) => item.openid === detail.value?.openid) ?? null
})

watch(selectedEntry, (entry) => {
  draftName.value = entry?.name ?? ''
})

function sourceLabel(source: string | null | undefined): string {
  if (!source) return '事件'
  if (source.includes('GROUP_AT_MESSAGE') || source.includes('GROUP_MESSAGE')) return '群消息'
  if (source.includes('C2C')) return '单聊'
  if (source.includes('FRIEND')) return '好友'
  if (source.includes('GROUP_ADD') || source.includes('GROUP_DEL')) return '入群'
  if (source.includes('MESSAGE')) return '频道'
  return '事件'
}

function openDetail(kindValue: CacheKind, openid: string) {
  detail.value = { kind: kindValue, openid }
}

async function onRefresh() {
  refreshing.value = true
  try {
    await refreshCache()
    toast('info', '缓存已刷新')
  } finally {
    refreshing.value = false
  }
}

async function saveName() {
  if (!detail.value || !selectedEntry.value) return
  await renameCacheEntry(detail.value.kind, detail.value.openid, draftName.value.trim())
  toast('success', '名称已保存到本地缓存')
}

async function onRefreshGroup() {
  if (!detail.value || detail.value.kind !== 'group') return
  refreshing.value = true
  try {
    const updated = await refreshGroup(detail.value.openid)
    if (updated) toast('success', '群信息已从 API 刷新')
    else toast('error', '缓存中找不到这个群')
  } catch (reason) {
    toast('error', reason instanceof Error ? reason.message : String(reason))
  } finally {
    refreshing.value = false
  }
}

async function copyOpenid(openid: string) {
  try {
    await navigator.clipboard.writeText(openid)
    toast('success', 'OpenID 已复制')
  } catch {
    /* ignore */
  }
}

async function confirmClearNow() {
  const target = confirmClear.value
  if (!target) return
  await clearCache(target === 'all' ? undefined : target === 'group' ? 'groups' : 'users')
  confirmClear.value = null
  detail.value = null
}
</script>

<template>
  <div class="cache-page">
    <header class="cache-toolbar">
      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ active: kind === 'group' }"
          @click="kind = 'group'"
        >
          <UsersRound :size="13" />
          群聊
          <span class="count">{{ app.cache.groups.length }}</span>
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: kind === 'user' }"
          @click="kind = 'user'"
        >
          <UserRound :size="13" />
          用户
          <span class="count">{{ app.cache.users.length }}</span>
        </button>
      </div>

      <div class="toolbar-right">
        <div class="search-box">
          <Search :size="13" />
          <input
            v-model="search"
            class="search"
            type="text"
            :placeholder="kind === 'group' ? '搜索群名称或 OpenID' : '搜索昵称或 OpenID'"
            spellcheck="false"
          />
        </div>
        <button class="btn small" type="button" :disabled="refreshing" @click="onRefresh">
          <RefreshCw :size="12" :class="{ spin: refreshing }" />
          刷新
        </button>
        <button
          class="btn small danger"
          type="button"
          :disabled="!current.length"
          @click="confirmClear = kind"
        >
          <Trash2 :size="12" />
          清空{{ kind === 'group' ? '群聊' : '用户' }}
        </button>
      </div>
    </header>

    <div class="cache-body">
      <div v-if="!current.length" class="empty">
        <Database :size="28" class="empty-icon" />
        <p class="empty-title">
          {{ search ? '没有匹配的缓存记录' : kind === 'group' ? '还没有群聊缓存' : '还没有用户缓存' }}
        </p>
        <p class="empty-desc">
          {{
            search
              ? '换个关键词试试。'
              : 'Bot 收到群消息或单聊消息时，qbotwire 会自动记录群与用户资料，供发送接口时填充 ID。'
          }}
        </p>
      </div>

      <div v-else class="grid">
        <button
          v-for="entry in current"
          :key="entry.openid"
          type="button"
          class="card"
          @click="openDetail(kind, entry.openid)"
        >
          <Avatar
            :name="entry.name"
            :src="entry.avatar"
            :kind="kind === 'group' ? 'group' : 'user'"
            :size="40"
          />
          <div class="card-main">
            <span class="card-name">{{ entry.name || (kind === 'group' ? '未命名群聊' : '未命名用户') }}</span>
            <span class="card-id mono">{{ entry.openid }}</span>
            <div class="card-meta">
              <span v-if="kind === 'group' && 'memberCount' in entry && entry.memberCount">
                {{ entry.memberCount }} 人
              </span>
              <span>{{ entry.messageCount }} 条消息</span>
              <span>{{ formatRelative(entry.lastSeen) }}</span>
              <span class="source">{{ sourceLabel(entry.source) }}</span>
            </div>
          </div>
        </button>
      </div>
    </div>

    <footer class="cache-foot">
      <span>
        <Database :size="11" />
        缓存落盘于本机应用数据目录，可在设置中清空。
      </span>
      <span class="mono">groups {{ app.cache.groups.length }} · users {{ app.cache.users.length }}</span>
    </footer>

    <Modal v-if="detail && selectedEntry" width="560px" @close="detail = null">
      <template #header>缓存详情</template>
      <div class="detail">
        <div class="detail-top">
          <Avatar
            :name="selectedEntry.name"
            :src="selectedEntry.avatar"
            :kind="detail.kind === 'group' ? 'group' : 'user'"
            :size="56"
          />
          <div class="detail-head-main">
            <span class="detail-name">
              {{ selectedEntry.name || (detail.kind === 'group' ? '未命名群聊' : '未命名用户') }}
            </span>
            <span class="detail-kind">{{ detail.kind === 'group' ? '群聊' : '用户' }}缓存</span>
          </div>
        </div>

        <label class="name-field">
          <span class="name-label">显示名称</span>
          <div class="name-row">
            <input v-model="draftName" class="input" placeholder="给这个缓存起个名字" />
            <button class="btn small" type="button" @click="saveName">保存</button>
          </div>
          <span class="name-hint">名称只保存在本机，不会修改 QQ 上的真实资料。</span>
        </label>

        <dl class="detail-fields">
          <dt>OpenID</dt>
          <dd>
            <span class="mono">{{ selectedEntry.openid }}</span>
            <button class="copy" type="button" title="复制 OpenID" @click="copyOpenid(selectedEntry.openid)">
              <Copy :size="11" />
            </button>
          </dd>
          <template v-if="detail.kind === 'user' && 'unionOpenid' in selectedEntry">
            <dt>Union OpenID</dt>
            <dd class="mono">{{ selectedEntry.unionOpenid || '—' }}</dd>
          </template>
          <template v-if="detail.kind === 'group' && 'memberCount' in selectedEntry">
            <dt>成员数</dt>
            <dd>{{ selectedEntry.memberCount ?? '—' }}</dd>
          </template>
          <dt>消息计数</dt>
          <dd>{{ selectedEntry.messageCount }}</dd>
          <dt>首次出现</dt>
          <dd>{{ formatDateTime(selectedEntry.firstSeen) }}</dd>
          <dt>最近出现</dt>
          <dd>{{ formatDateTime(selectedEntry.lastSeen) }} · {{ formatRelative(selectedEntry.lastSeen) }}</dd>
          <dt>来源事件</dt>
          <dd class="mono">{{ selectedEntry.source || '—' }}</dd>
          <template v-if="detail.kind === 'group' && 'infoFetchedAt' in selectedEntry">
            <dt>群信息刷新</dt>
            <dd>{{ selectedEntry.infoFetchedAt ? formatDateTime(selectedEntry.infoFetchedAt) : '尚未刷新' }}</dd>
          </template>
        </dl>
      </div>
      <template #footer>
        <button
          v-if="detail.kind === 'group'"
          class="btn"
          type="button"
          :disabled="refreshing"
          @click="onRefreshGroup"
        >
          <RefreshCw :size="12" :class="{ spin: refreshing }" />
          从 API 刷新群信息
        </button>
        <button class="btn primary" type="button" @click="detail = null">完成</button>
      </template>
    </Modal>

    <Modal v-if="confirmClear" width="440px" @close="confirmClear = null">
      <template #header>清空缓存</template>
      <p class="confirm-text">
        确定要清空{{ confirmClear === 'all' ? '全部' : confirmClear === 'group' ? '群聊' : '用户' }}缓存吗？
        该操作只影响本机记录，不会影响 QQ 侧的群和用户资料。
      </p>
      <template #footer>
        <button class="btn" type="button" @click="confirmClear = null">取消</button>
        <button class="btn danger" type="button" @click="confirmClearNow">清空</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.cache-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.cache-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
  flex: none;
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--panel-3);
  border-radius: 9px;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 27px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 11.5px;
  color: var(--ink-3);
}

.tab:hover {
  color: var(--ink-2);
}

.tab.active {
  background: #fff;
  color: var(--ink);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.count {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-3);
  background: var(--panel-3);
  padding: 0 4px;
  border-radius: 999px;
}

.tab.active .count {
  background: var(--accent-soft);
  color: var(--accent);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 230px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: var(--panel-2);
  color: var(--ink-3);
}

.search-box:focus-within {
  background: #fff;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.search {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 11.5px;
}

.cache-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 18px 24px;
  background: #f7f9fc;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px;
  text-align: left;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: #fff;
  box-shadow: var(--shadow-sm);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease;
}

.card:hover {
  border-color: var(--accent-line);
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.08);
  transform: translateY(-1px);
}

.card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-id {
  font-size: 10px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 3px;
  font-size: 10px;
  color: var(--ink-3);
}

.source {
  font-size: 9px;
  color: #8a94a6;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 0 4px;
}

.empty {
  height: 100%;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--ink-3);
}

.empty-icon {
  color: #c4cddb;
  margin-bottom: 4px;
}

.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
}

.empty-desc {
  margin: 0;
  max-width: 420px;
  text-align: center;
  font-size: 11px;
  line-height: 1.7;
}

.cache-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 16px;
  border-top: 1px solid var(--line);
  background: var(--panel);
  font-size: 10px;
  color: var(--ink-3);
  flex: none;
}

.cache-foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-top {
  display: flex;
  align-items: center;
  gap: 13px;
}

.detail-head-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.detail-name {
  font-size: 16px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-kind {
  font-size: 10px;
  color: var(--ink-3);
}

.name-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.name-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-2);
}

.name-row {
  display: flex;
  gap: 6px;
}

.name-hint {
  font-size: 10px;
  color: var(--ink-3);
}

.detail-fields {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  gap: 8px 12px;
  margin: 0;
  font-size: 11.5px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}

.detail-fields dt {
  color: var(--ink-3);
}

.detail-fields dd {
  margin: 0;
  color: var(--ink-2);
  word-break: break-all;
}

.copy {
  display: inline-flex;
  margin-left: 6px;
  color: var(--ink-3);
  vertical-align: middle;
}

.copy:hover {
  color: var(--accent);
}

.confirm-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-2);
}

@media (max-width: 1100px) {
  .search-box {
    width: 170px;
  }
}
</style>
