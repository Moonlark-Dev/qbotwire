import type { CatalogEndpoint } from './apiCatalog'
import type { ApiRequest, ApiResponse, QueryParam, SavedEndpoint } from '@/types'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestTab {
  id: string
  title: string
  endpointId: string | null
  custom: boolean
  method: HttpMethod
  path: string
  pathParams: Record<string, string>
  query: QueryParam[]
  body: string
  /** Set when the tab was opened from a locally saved endpoint. */
  savedId: string | null
  /** Set when a successful request auto-saved an endpoint in this tab. */
  savedHint: string | null
  response: ApiResponse | null
  error: string | null
  sending: boolean
}

export function uid(prefix = 'tab'): string {
  tabCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${tabCounter}`
}

let tabCounter = 0

export function pathParamNames(path: string): string[] {
  return [...path.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1])
}

export function applyPathParams(path: string, values: Record<string, string>): string {
  return path.replace(/\{([a-zA-Z0-9_]+)\}/g, (whole, name: string) => {
    const value = values[name]?.trim()
    return value ? encodeURIComponent(value) : whole
  })
}

export function missingPathParams(path: string, values: Record<string, string>): string[] {
  return pathParamNames(path).filter((name) => !values[name]?.trim())
}

export function methodAllowsBody(method: string): boolean {
  return !['GET', 'HEAD'].includes(method.toUpperCase())
}

export function defaultQuery(endpoint: CatalogEndpoint): QueryParam[] {
  return endpoint.query.map((row) => ({
    key: row.name,
    value: row.placeholder,
    enabled: row.placeholder !== '',
  }))
}

export function tabFromEndpoint(endpoint: CatalogEndpoint): RequestTab {
  return {
    id: uid(),
    title: endpoint.name,
    endpointId: endpoint.id,
    custom: false,
    method: endpoint.method,
    path: endpoint.path,
    pathParams: {},
    query: defaultQuery(endpoint),
    body: endpoint.body,
    savedId: null,
    savedHint: null,
    response: null,
    error: null,
    sending: false,
  }
}

export function blankTab(): RequestTab {
  return {
    id: uid(),
    title: '自定义请求',
    endpointId: null,
    custom: true,
    method: 'GET',
    path: '/users/@me',
    pathParams: {},
    query: [],
    body: '',
    savedId: null,
    savedHint: null,
    response: null,
    error: null,
    sending: false,
  }
}

export function tabFromSaved(saved: SavedEndpoint): RequestTab {
  return {
    id: uid(),
    title: saved.name,
    endpointId: null,
    custom: true,
    method: (saved.method as HttpMethod) || 'GET',
    path: saved.path,
    pathParams: {},
    query: saved.query.map((row) => ({ ...row })),
    body: saved.body,
    savedId: saved.id,
    savedHint: null,
    response: null,
    error: null,
    sending: false,
  }
}

export function autoEndpointName(method: string, path: string): string {
  const compact = path.split('?')[0]
  const segments = compact.split('/').filter(Boolean)
  const tail = segments.slice(-2).join('/')
  return `${method.toUpperCase()} /${tail || compact}`
}

export function makeSaved(tab: RequestTab, name: string): SavedEndpoint {
  const now = new Date().toISOString()
  return {
    id: tab.savedId ?? uid('saved'),
    name: name.trim() || autoEndpointName(tab.method, tab.path),
    method: tab.method,
    path: tab.path,
    query: tab.query.map((row) => ({ ...row })),
    body: tab.body,
    createdAt: now,
    lastUsedAt: now,
    useCount: 1,
  }
}

export function requestFromTab(tab: RequestTab): ApiRequest {
  return {
    method: tab.method,
    path: applyPathParams(tab.path, tab.pathParams),
    query: tab.query.filter((row) => row.enabled && row.key.trim()),
    body: methodAllowsBody(tab.method) ? tab.body : '',
  }
}

export function validateTab(tab: RequestTab): string | null {
  if (!tab.path.trim()) return '接口路径不能为空'
  if (!tab.path.trim().startsWith('/') && !/^https?:\/\//i.test(tab.path.trim())) {
    return '接口路径需要以 / 开头（或填写完整 http(s) URL）'
  }
  const missing = missingPathParams(tab.path, tab.pathParams)
  if (missing.length) return `请填写路径参数：${missing.join('、')}`
  if (methodAllowsBody(tab.method) && tab.body.trim()) {
    try {
      JSON.parse(tab.body)
    } catch (error) {
      return `请求体不是合法 JSON：${(error as Error).message}`
    }
  }
  return null
}

/** Used to recognise a request that has already been saved. */
export function sameRequest(a: Pick<RequestTab, 'method' | 'path' | 'body'>, b: SavedEndpoint): boolean {
  return (
    a.method.toUpperCase() === b.method.toUpperCase() &&
    a.path.trim() === b.path.trim() &&
    a.body.trim() === b.body.trim()
  )
}
