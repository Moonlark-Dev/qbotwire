<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { app } from '@/stores/app'
import { resolveUserAvatar } from '@/lib/avatar'
import { formatRelative } from '@/lib/format'
import Avatar from './Avatar.vue'
import Modal from './Modal.vue'
import { AtSign, Search, UserRound, UsersRound } from 'lucide-vue-next'

/**
 * 从缓存里挑一个用户或群聊，把它的 OpenID 交回给调用方。
 * 调用方负责决定插入位置（请求体里通常是光标处），这里只负责选择。
 */

type PickerKind = 'user' | 'group'

const emit = defineEmits<{ pick: [openid: string]; close: [] }>()

const kind = ref<PickerKind>(app.cache.users.length || !app.cache.groups.length ? 'user' : 'group')
const search = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

interface Row {
  openid: string
  name: string
  avatar: string | null | undefined
  kind: PickerKind
  meta: string
}

const rows = computed<Row[]>(() => {
  if (kind.value === 'group') {
    return app.cache.groups.map((group) => ({
      openid: group.openid,
      name: group.name || '未命名群聊',
      avatar: group.avatar,
      kind: 'group' as const,
      meta: group.memberCount
        ? `${group.memberCount} 人 · ${formatRelative(group.lastSeen)}`
        : formatRelative(group.lastSeen),
    }))
  }
  return app.cache.users.map((user) => ({
    openid: user.openid,
    name: user.name || '未命名用户',
    avatar: resolveUserAvatar(app.credentials?.appId, user),
    kind: 'user' as const,
    meta: formatRelative(user.lastSeen),
  }))
})

const filtered = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (!needle) return rows.value
  return rows.value.filter(
    (row) => row.openid.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle),
  )
})

const emptyHint = computed(() => {
  if (search.value.trim()) return '没有匹配的缓存记录，换个关键词试试。'
  return kind.value === 'user'
    ? '还没有用户缓存。Bot 收到单聊或群消息后会自动记录发送者。'
    : '还没有群聊缓存。Bot 收到群消息后会自动记录群聊。'
})

function selectTab(next: PickerKind) {
  kind.value = next
  search.value = ''
  searchInput.value?.focus()
}

function pick(row: Row | undefined) {
  if (!row) return
  emit('pick', row.openid)
}

function onSearchKey(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    pick(filtered.value[0])
  }
}

onMounted(() => searchInput.value?.focus())
</script>

<template>
  <Modal width="540px" @close="emit('close')">
    <template #header>
      <span class="head-title"><AtSign :size="15" /> 插入 OpenID</span>
    </template>

    <div class="picker">
      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ active: kind === 'user' }"
          @click="selectTab('user')"
        >
          <UserRound :size="13" />
          用户
          <span class="count">{{ app.cache.users.length }}</span>
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: kind === 'group' }"
          @click="selectTab('group')"
        >
          <UsersRound :size="13" />
          群聊
          <span class="count">{{ app.cache.groups.length }}</span>
        </button>
      </div>

      <div class="search-box">
        <Search :size="13" />
        <input
          ref="searchInput"
          v-model="search"
          class="search"
          type="text"
          :placeholder="kind === 'user' ? '搜索昵称或 OpenID' : '搜索群名称或 OpenID'"
          spellcheck="false"
          @keydown="onSearchKey"
        />
      </div>

      <div class="options">
        <button
          v-for="row in filtered"
          :key="row.openid"
          type="button"
          class="option"
          @click="pick(row)"
        >
          <Avatar :name="row.name" :src="row.avatar" :kind="row.kind" :size="28" />
          <span class="option-main">
            <span class="option-name">{{ row.name }}</span>
            <span class="option-id mono">{{ row.openid }}</span>
          </span>
          <span class="option-meta">{{ row.meta }}</span>
        </button>
        <div v-if="!filtered.length" class="empty">
          <AtSign :size="20" class="empty-icon" />
          <p>{{ emptyHint }}</p>
        </div>
      </div>

      <div class="hint">
        点击（或在搜索框按 Enter）即可在请求体光标位置插入 OpenID。
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.head-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: -4px -2px -6px;
}

.tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  background: var(--panel-3);
  border-radius: 9px;
  align-self: flex-start;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 7px;
  font-size: 11.5px;
  color: var(--ink-3);
}

.tab.active {
  background: var(--panel);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
  font-weight: 600;
}

.count {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-3);
  background: var(--panel);
  padding: 0 4px;
  border-radius: 999px;
}

.tab.active .count {
  background: var(--accent-soft);
  color: var(--accent);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  height: 34px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--ink-3);
}

.search-box:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  background: #fff;
}

.search {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  color: var(--ink);
}

.options {
  max-height: 300px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px;
}

.option {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border-radius: 8px;
  text-align: left;
}

.option:hover,
.option:focus-visible {
  background: var(--accent-soft);
}

.option-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.option-name {
  font-size: 12.5px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-id {
  font-size: 10.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-meta {
  flex: none;
  font-size: 10px;
  color: var(--ink-3);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 16px;
  text-align: center;
  color: var(--ink-3);
  font-size: 11.5px;
}

.empty p {
  margin: 0;
  max-width: 320px;
  line-height: 1.6;
}

.empty-icon {
  color: #b6c0d2;
}

.hint {
  padding: 7px 2px 0;
  border-top: 1px dashed var(--line);
  font-size: 10.5px;
  color: var(--ink-3);
}
</style>
