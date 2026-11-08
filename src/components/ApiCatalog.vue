<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CATALOG, CATEGORIES, type CatalogEndpoint } from '@/lib/apiCatalog'
import { scrollFromWheel } from '@/lib/scroll'
import type { SavedEndpoint } from '@/types'
import { Bookmark, Search, Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  saved: SavedEndpoint[]
  activeId: string | null
}>()

const emit = defineEmits<{
  select: [endpoint: CatalogEndpoint]
  openSaved: [endpoint: SavedEndpoint]
  deleteSaved: [endpoint: SavedEndpoint]
}>()

const search = ref('')
const category = ref('全部')
const chips = ref<HTMLElement | null>(null)

const categories = computed(() => ['全部', ...CATEGORIES])
const filteredSaved = computed(() => {
  const needle = search.value.trim().toLowerCase()
  if (category.value !== '全部' && category.value !== '已保存') return []
  return props.saved.filter(
    (item) =>
      !needle ||
      item.name.toLowerCase().includes(needle) ||
      item.path.toLowerCase().includes(needle) ||
      item.method.toLowerCase().includes(needle),
  )
})

const groups = computed(() => {
  const needle = search.value.trim().toLowerCase()
  const list = CATALOG.filter((item) => {
    const matchesCategory =
      category.value === '全部' || category.value === '已保存' || item.category === category.value
    if (!matchesCategory) return false
    if (!needle) return true
    return (
      item.name.toLowerCase().includes(needle) ||
      item.path.toLowerCase().includes(needle) ||
      item.description.toLowerCase().includes(needle)
    )
  })
  const grouped = new Map<string, CatalogEndpoint[]>()
  for (const item of list) {
    const bucket = grouped.get(item.category) ?? []
    bucket.push(item)
    grouped.set(item.category, bucket)
  }
  return [...grouped.entries()]
})

const total = computed(() => CATALOG.length)
const savedCount = computed(() => props.saved.length)

function methodClass(method: string) {
  return `method-${method.toLowerCase()}`
}

function onChipsWheel(event: WheelEvent) {
  scrollFromWheel(event, chips.value)
}

onMounted(() => {
  chips.value?.addEventListener('wheel', onChipsWheel, { passive: false })
})

onBeforeUnmount(() => {
  chips.value?.removeEventListener('wheel', onChipsWheel)
})
</script>

<template>
  <aside class="catalog">
    <header class="catalog-head">
      <div class="head-row">
        <h2>接口目录</h2>
        <span class="count">{{ total }}</span>
      </div>
      <div class="search-box">
        <Search :size="14" />
        <input
          v-model="search"
          class="search"
          type="text"
          placeholder="搜索接口名称或路径"
          spellcheck="false"
        />
        <kbd v-if="!search">/</kbd>
        <button v-else class="clear" type="button" @click="search = ''">清除</button>
      </div>
      <div ref="chips" class="chips">
        <button
          v-for="item in categories"
          :key="item"
          type="button"
          class="chip"
          :class="{ active: category === item }"
          @click="category = item"
        >
          {{ item }}
        </button>
        <button
          v-if="savedCount"
          type="button"
          class="chip saved-chip"
          :class="{ active: category === '已保存' }"
          @click="category = '已保存'"
        >
          已保存 {{ savedCount }}
        </button>
      </div>
    </header>

    <div class="catalog-scroll">
      <section v-if="filteredSaved.length" class="group saved-group">
        <h3 class="group-title">
          <Bookmark :size="12" />
          已保存接口
          <span>{{ filteredSaved.length }}</span>
        </h3>
        <div
          v-for="item in filteredSaved"
          :key="item.id"
          class="row saved-row"
          :class="methodClass(item.method)"
          role="button"
          tabindex="0"
          @click="emit('openSaved', item)"
          @keydown.enter="emit('openSaved', item)"
        >
          <span class="method">{{ item.method }}</span>
          <div class="row-text">
            <span class="row-name">{{ item.name }}</span>
            <span class="row-path mono">{{ item.path }}</span>
          </div>
          <button
            class="row-trash"
            type="button"
            title="删除这个已保存接口"
            @click.stop="emit('deleteSaved', item)"
          >
            <Trash2 :size="13" />
          </button>
        </div>
      </section>

      <section v-for="[name, items] in groups" :key="name" class="group">
        <h3 class="group-title">{{ name }}<span>{{ items.length }}</span></h3>
        <div
          v-for="item in items"
          :key="item.id"
          class="row"
          :class="[methodClass(item.method), { active: activeId === item.id }]"
          role="button"
          tabindex="0"
          :title="item.description"
          @click="emit('select', item)"
          @keydown.enter="emit('select', item)"
        >
          <span class="method">{{ item.method }}</span>
          <div class="row-text">
            <span class="row-name">{{ item.name }}</span>
            <span class="row-path mono">{{ item.path }}</span>
          </div>
        </div>
      </section>

      <div v-if="!filteredSaved.length && !groups.length" class="empty">
        没有匹配的接口
      </div>
    </div>

    <footer class="catalog-foot">
      <a href="https://bot.q.qq.com/wiki/develop/api-v2/" target="_blank" rel="noreferrer">
        QQ Bot API v2 文档
      </a>
      <span class="mono">{{ savedCount }} saved</span>
    </footer>
  </aside>
</template>

<style scoped>
.catalog {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--line);
  background: var(--panel);
}

.catalog-head {
  padding: 16px 14px 10px;
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.head-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 2px;
}

.head-row h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.count {
  font-size: 10.5px;
  color: var(--ink-3);
  font-family: var(--font-mono);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--ink-3);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.search-box:focus-within {
  border-color: var(--accent);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.search {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  color: var(--ink);
}

.search::placeholder {
  color: #a9b2c2;
}

kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-3);
  border: 1px solid var(--line-strong);
  border-radius: 4px;
  padding: 0 4px;
  line-height: 15px;
  background: #fff;
}

.clear {
  font-size: 10.5px;
  color: var(--ink-3);
}

.clear:hover {
  color: var(--ink);
}

.chips {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  flex: none;
  height: 23px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10.5px;
  color: var(--ink-3);
  border: 1px solid transparent;
  white-space: nowrap;
}

.chip:hover {
  color: var(--ink-2);
  background: var(--panel-3);
}

.chip.active {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-2);
  font-weight: 600;
}

.saved-chip {
  border-color: #f0d9b5;
  color: #9a5b00;
}

.catalog-scroll {
  flex: 1;
  overflow: auto;
  padding: 8px 8px 14px;
  min-height: 0;
}

.group {
  margin-top: 10px;
}

.group:first-child {
  margin-top: 2px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  padding: 5px 7px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
}

.group-title span {
  font-family: var(--font-mono);
  font-weight: 500;
  letter-spacing: 0;
  color: #b0b9c8;
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s ease, border-color 0.1s ease;
}

.row:hover {
  background: var(--panel-2);
}

.row.active {
  background: var(--accent-soft);
  border-color: var(--accent-line);
}

.row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.method {
  flex: none;
  min-width: 40px;
  text-align: center;
  margin-top: 1px;
  padding: 1px 4px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: var(--panel-3);
  color: var(--ink-3);
}

.row-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.row-name {
  font-size: 12px;
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-path {
  font-size: 9.5px;
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row.active .row-name {
  color: var(--accent-2);
  font-weight: 600;
}

/* Method accents */
.method-get {
  color: #157347;
}
.row.method-get .method {
  background: #e9f9ef;
  color: #157347;
}

.method-post {
  color: #1d4ed8;
}
.row.method-post .method {
  background: #eef4ff;
  color: #1d4ed8;
}

.method-put,
.method-patch {
  color: #9a5b00;
}
.row.method-put .method,
.row.method-patch .method {
  background: #fff7e8;
  color: #9a5b00;
}

.method-delete {
  color: #b42318;
}
.row.method-delete .method {
  background: #fef0f0;
  color: #b42318;
}

.saved-row {
  background: #fffdf7;
  border-color: #f6ead2;
}

.saved-row:hover {
  background: #fff9ec;
}

.row-trash {
  flex: none;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #b7a179;
  border-radius: 5px;
  opacity: 0;
  transition: opacity 0.1s ease, background 0.1s ease, color 0.1s ease;
}

.saved-row:hover .row-trash,
.row-trash:focus-visible {
  opacity: 1;
}

.row-trash:hover {
  background: var(--red-soft);
  color: var(--red);
}

.empty {
  padding: 30px 10px;
  text-align: center;
  font-size: 12px;
  color: var(--ink-3);
}

.catalog-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 14px;
  border-top: 1px solid var(--line);
  background: var(--panel-2);
  font-size: 10px;
  color: var(--ink-3);
}

.catalog-foot a {
  color: var(--ink-3);
}

.catalog-foot a:hover {
  color: var(--accent);
}
</style>
