import { formatRelativeTime } from './utils.js'
import { registerPageCleanup } from './page-cleanup.js'

const DEFAULT_SOURCE = 'local'
const DEFAULT_LIMIT = 5
const DEFAULT_REMOTE_LIMIT = 20
const DEFAULT_INTERVAL = 5000
const REQUEST_TIMEOUT = 8000
const MAX_RESOURCE_HINTS = 2
const RESOURCE_LABELS = {
  image: '图片',
  video: '视频',
  github: 'GitHub',
  website: '链接',
  location: '位置',
  music: '音乐',
  tweet: 'Tweet',
}
const RESOURCE_ICONS = {
  image: '▧',
  video: '▹',
  github: '◈',
  website: '↗',
  location: '⌖',
  music: '♫',
  tweet: '𝕏',
}

function text(value, fallback = '') {
  if (typeof value === 'string') return value.trim()
  if (value == null) return fallback
  return String(value).trim()
}

function safeInt(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch (_) {
    return false
  }
}

function safeUrl(value, httpsOnly = false) {
  const raw = text(value)
  if (!isHttpUrl(raw)) return ''
  if (httpsOnly && !raw.toLowerCase().startsWith('https://')) return ''
  return raw
}

function parseDate(value) {
  if (typeof value === 'number' || /^\d+$/.test(text(value))) {
    const seconds = safeInt(value)
    if (seconds > 0) {
      const date = new Date(seconds * 1000)
      if (!Number.isNaN(date.getTime())) return date.toISOString()
    }
  }
  const date = new Date(text(value))
  return text(value) && !Number.isNaN(date.getTime()) ? date.toISOString() : ''
}

function unique(values) {
  return [...new Set(values.map((value) => text(value).toLowerCase()).filter(Boolean))]
}

function parseJson(value, fallback = null) {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch (_) { return fallback }
}

function parseExtensions(value) {
  const values = Array.isArray(value) ? value : (value == null ? [] : [value])
  return values.flatMap((item) => {
    const parsed = parseJson(item, item)
    if (!parsed || typeof parsed !== 'object') return []
    const rawType = text(parsed.type).toUpperCase()
    const typeMap = { GITHUBPROJ: 'github', WEBSITE: 'website', LOCATION: 'location', MUSIC: 'music', TWEET: 'tweet', VIDEO: 'video' }
    const type = typeMap[rawType] || rawType.toLowerCase()
    const payload = parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : parsed
    return type ? [{ type, payload }] : []
  })
}

function extensionHints(extensions) {
  return parseExtensions(extensions).flatMap(({ type, payload }) => {
    if (!RESOURCE_LABELS[type]) return []
    if (type === 'location') {
      const name = text(payload.name || payload.placeholder || payload.address)
      return [{ type, label: name ? `位置：${name}` : '位置' }]
    }
    return [{ type, label: RESOURCE_LABELS[type] }]
  })
}

function stripSummary(value) {
  let result = text(value)
  result = result.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  result = result.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  result = result.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  result = result.replace(/<[^>]*>/g, ' ')
  result = result.replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
  result = result.replace(/[*_~>#-]+/g, ' ')
  result = result.replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, '$1')
  result = result.replace(/\s+/g, ' ').trim()
  return result || '…'
}

function truncate(value, limit) {
  const source = stripSummary(value)
  if (source.length <= limit) return source
  return `${source.slice(0, Math.max(1, limit - 1)).trimEnd()}…`
}

function parseTags(value) {
  const list = Array.isArray(value) ? value : (value == null ? [] : [value])
  return [...new Set(list.map((item) => item && typeof item === 'object' ? text(item.name || item.label) : text(item)).filter(Boolean))].slice(0, 8)
}

function mediaHints(value) {
  const list = Array.isArray(value) ? value : []
  return list.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const file = item.file && typeof item.file === 'object' ? item.file : item
    const url = safeUrl(item.media_url || file.url || item.url || item.src, true)
    if (!url || item.is_deleted) return []
    const kind = text(file.category || item.media_type || file.content_type || item.content_type || item.type).toLowerCase()
    if (kind.startsWith('video') || kind === 'video') return ['video']
    if (kind.startsWith('image') || kind === 'image' || /\.(avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(url)) return ['image']
    return []
  })
}

function normalizeLocalItem(item) {
  if (!item || typeof item !== 'object') return null
  const date = parseDate(item.dateISO || item.date)
  const sourceId = text(item.sourceId)
  if (!sourceId || !date) return null
  const extensions = parseExtensions(item.extensions || item.extension)
  const hints = unique([...(Array.isArray(item.resourceTypes) ? item.resourceTypes : []), ...mediaHints(item.photos), ...extensionHints(extensions).map((hint) => hint.type)])
  return {
    source: 'local',
    sourceId,
    content: text(item.content),
    summary: stripSummary(item.summary || item.content),
    date,
    pinnedOrder: 0,
    isAd: false,
    tags: parseTags(item.tags),
    resourceTypes: hints,
    resourceHints: extensionHints(extensions),
    detailUrl: text(item.detailUrl, '/moments/') || '/moments/',
  }
}

function normalizeRemoteItem(item, provider, remoteURL) {
  if (!item || typeof item !== 'object') return null
  const id = text(item.id)
  const date = parseDate(item.created_at || item.updated_at)
  if (!id || !date) return null
  const extensions = parseExtensions(item.extension || item.extensions)
  const media = item.echo_files || item.media
  const hints = unique([...mediaHints(media), ...extensionHints(extensions).map((hint) => hint.type)])
  return {
    source: 'remote',
    sourceId: id,
    content: text(item.content),
    summary: stripSummary(item.content),
    date,
    pinnedOrder: provider === 'ech0' ? 0 : Math.max(0, safeInt(item.pinned_order)),
    isAd: provider !== 'ech0' && (safeInt(item.is_ad) === 1 || item.is_ad === true),
    tags: parseTags(item.tags),
    resourceTypes: hints,
    resourceHints: extensionHints(extensions),
    detailUrl: provider === 'ech0' ? `${remoteURL.replace(/\/$/, '')}/echo/${encodeURIComponent(id)}` : '/moments/',
  }
}

function compareMoments(a, b) {
  const aPinned = a.source === 'remote' && a.pinnedOrder > 0
  const bPinned = b.source === 'remote' && b.pinnedOrder > 0
  if (aPinned !== bPinned) return aPinned ? -1 : 1
  if (aPinned && bPinned && a.pinnedOrder !== b.pinnedOrder) return a.pinnedOrder - b.pinnedOrder
  const dateDiff = Date.parse(b.date) - Date.parse(a.date)
  if (Number.isFinite(dateDiff) && dateDiff !== 0) return dateDiff
  return `${a.source}:${a.sourceId}`.localeCompare(`${b.source}:${b.sourceId}`)
}

function uniqueSorted(items) {
  const seen = new Set()
  return items.filter((item) => {
    const key = `${item.source}:${item.sourceId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort(compareMoments)
}

function readConfig(root) {
  const bool = (name, fallback) => root.dataset[name] == null ? fallback : root.dataset[name] === 'true'
  const source = ['local', 'remote', 'both'].includes(root.dataset.homeMomentsSource)
    ? root.dataset.homeMomentsSource
    : DEFAULT_SOURCE
  return {
    root,
    source,
    provider: root.dataset.homeMomentsProvider === 'blog_api' ? 'blog_api' : 'ech0',
    remoteURL: safeUrl(root.dataset.homeMomentsRemoteUrl, true),
    remoteEndpoint: root.dataset.homeMomentsRemoteEndpoint || '/api/echo/query',
    maxItems: Math.max(1, safeInt(root.dataset.homeMomentsMaxItems, DEFAULT_LIMIT)),
    remoteMaxItems: Math.max(1, safeInt(root.dataset.homeMomentsRemoteMaxItems, DEFAULT_REMOTE_LIMIT)),
    interval: Math.max(1000, safeInt(root.dataset.homeMomentsInterval, DEFAULT_INTERVAL)),
    autoPlay: bool('homeMomentsAutoplay', true),
    sourceBadge: bool('homeMomentsSourceBadge', true),
    resourceIcons: bool('homeMomentsResourceIcons', true),
    tags: bool('homeMomentsTags', true),
    showTime: bool('homeMomentsTime', true),
    showAds: bool('homeMomentsShowAds', true),
    adBadge: bool('homeMomentsAdBadge', true),
  }
}

function readLocalItems(root) {
  const data = root.querySelector('[data-home-moments-local-data]')
  if (!data) return []
  try {
    let payload = JSON.parse(data.textContent || '[]')
    if (typeof payload === 'string') payload = JSON.parse(payload)
    const items = Array.isArray(payload) ? payload : payload?.items
    return (Array.isArray(items) ? items : []).map(normalizeLocalItem).filter(Boolean)
  } catch (error) {
    console.warn('[home-moments] local data parse failed', error)
    return []
  }
}

async function requestJson(url, options, signal) {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(url, { cache: 'no-store', ...(options || {}), signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json()
    const valid = payload?.code === 1 && Array.isArray(payload?.data?.items) || payload?.code === 200 && Array.isArray(payload?.data?.items)
    if (!valid) throw new Error('远程动态数据格式错误')
    return { items: payload.data.items, total: safeInt(payload.data.total, payload.data.items.length) }
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

async function fetchRemoteItems(config, signal) {
  if (!config.remoteURL) throw new Error('远程动态地址无效')
  const limit = config.source === 'both' ? config.remoteMaxItems : config.maxItems
  const items = []
  let page = 1
  let total = Infinity
  while (items.length < limit && items.length < total) {
    const url = new URL(config.remoteURL)
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', String(Math.min(100, limit)))
    const pageSize = Math.min(100, limit)
    const result = config.provider === 'ech0'
      ? await requestJson(new URL(config.remoteEndpoint, `${config.remoteURL.replace(/\/$/, '')}/`).toString(), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ page, pageSize, search: '', tagIds: [], sortBy: 'created_at', sortOrder: 'desc' }) }, signal)
      : await requestJson(url.toString(), {}, signal)
    const pageItems = result.items.slice(0, limit - items.length)
    items.push(...pageItems)
    total = Math.max(0, safeInt(result.total, items.length + pageItems.length))
    if (!pageItems.length || result.items.length < pageSize) break
    page += 1
  }
  return items.slice(0, limit).map((item) => normalizeRemoteItem(item, config.provider, config.remoteURL)).filter(Boolean)
}

function createElement(tag, className, value = '') {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (value) element.textContent = value
  return element
}

function renderItem(item, config) {
  const link = createElement('a', 'home-moments-ticker__item')
  link.href = item.detailUrl
  link.dataset.homeMomentsItem = `${item.source}:${item.sourceId}`
  link.setAttribute('aria-label', `查看这条动态：${item.summary}`)

  const summary = createElement('span', 'home-moments-ticker__summary', item.summary)
  link.appendChild(summary)

  const meta = createElement('span', 'home-moments-ticker__meta')
  if (config.showTime) {
    const time = createElement('time', 'home-moments-ticker__time')
    time.dateTime = item.date
    const absolute = new Date(item.date).toLocaleString('zh-CN')
    time.dataset.absolute = absolute
    time.textContent = formatRelativeTime(item.date, absolute, false)
    if (time.textContent !== absolute) time.title = absolute
    meta.appendChild(time)
  }
  if (config.sourceBadge) meta.appendChild(createElement('span', `home-moments-ticker__badge home-moments-ticker__badge--${item.source}`, item.source === 'remote' ? (config.provider === 'ech0' ? 'Ech0' : '远程') : '本地'))
  if (item.isAd && config.adBadge) meta.appendChild(createElement('span', 'home-moments-ticker__badge home-moments-ticker__badge--ad', '推广'))
  if (config.tags && item.tags.length) meta.appendChild(createElement('span', 'home-moments-ticker__tag', `#${item.tags[0]}`))
  if (config.resourceIcons) {
    const hints = [...item.resourceHints]
    item.resourceTypes.forEach((type) => {
      if (!hints.some((hint) => hint.type === type)) hints.push({ type, label: RESOURCE_LABELS[type] || type })
    })
    hints.slice(0, MAX_RESOURCE_HINTS).forEach((hint) => {
      const resource = createElement('span', `home-moments-ticker__resource home-moments-ticker__resource--${hint.type}`)
      resource.appendChild(createElement('span', 'home-moments-ticker__resource-icon', RESOURCE_ICONS[hint.type] || '•'))
      resource.appendChild(createElement('span', '', hint.label))
      meta.appendChild(resource)
    })
  }
  link.appendChild(meta)
  return link
}

function setStatus(state, message = '') {
  const { root } = state.config
  const status = root.querySelector('[data-home-moments-status]')
  const retry = root.querySelector('[data-home-moments-action="refresh"]')
  const messages = {
    loading: '正在加载说说…',
    empty: '暂时没有说说',
    error: state.config.source === 'both' ? '远程动态暂不可用，已显示本地内容' : '说说暂时无法加载',
  }
  if (status) {
    status.className = `home-moments-ticker__status is-${state.mode}`
    status.textContent = message || messages[state.mode] || ''
    status.hidden = state.mode === 'content' || !status.textContent
  }
  if (retry) {
    retry.hidden = !['error', 'empty'].includes(state.mode)
    retry.disabled = state.loading
    retry.textContent = state.loading ? '加载中…' : '重试'
  }
}

function renderEmpty(state) {
  const track = state.config.root.querySelector('[data-home-moments-track]')
  if (!track) return
  track.replaceChildren()
  state.index = 0
  state.items = []
  state.config.root.classList.add('is-empty')
  updateControls(state)
}

function renderInitial(state) {
  const track = state.config.root.querySelector('[data-home-moments-track]')
  if (!track) return
  track.replaceChildren()
  state.config.root.classList.toggle('is-empty', !state.items.length)
  if (!state.items.length) {
    renderEmpty(state)
    return
  }
  state.index = 0
  const item = renderItem(state.items[0], state.config)
  item.classList.add('is-active')
  track.appendChild(item)
  updateControls(state)
}

function updateControls(state) {
  const disabled = state.items.length <= 1 || state.mode === 'loading'
  state.config.root.querySelectorAll('[data-home-moments-action="prev"], [data-home-moments-action="next"]').forEach((button) => { button.disabled = disabled })
  const toggle = state.config.root.querySelector('[data-home-moments-action="toggle"]')
  const retry = state.config.root.querySelector('[data-home-moments-action="refresh"]')
  if (retry) {
    retry.hidden = !['error', 'empty'].includes(state.mode)
    retry.disabled = state.loading
    retry.textContent = state.loading ? '加载中…' : '重试'
  }
  if (toggle) {
    const paused = state.paused || !state.running
    toggle.disabled = state.items.length <= 1
    toggle.setAttribute('aria-pressed', String(paused))
    toggle.setAttribute('aria-label', paused ? '继续自动播放' : '暂停自动播放')
    toggle.textContent = paused ? '▶' : 'Ⅱ'
  }
}

function clearTimer(state) {
  if (state.timer) window.clearTimeout(state.timer)
  state.timer = null
}

function schedule(state) {
  clearTimer(state)
  if (!state.running || state.paused || state.hovered || state.focused || state.hidden || state.items.length <= 1 || state.reducedMotion) return
  state.timer = window.setTimeout(() => {
    state.timer = null
    transition(state, 1)
  }, state.config.interval)
}

function transition(state, direction) {
  if (state.transitioning || state.items.length <= 1) return
  const track = state.config.root.querySelector('[data-home-moments-track]')
  const current = track?.querySelector('.home-moments-ticker__item.is-active')
  if (!track || !current) return
  state.transitioning = true
  state.index = (state.index + direction + state.items.length) % state.items.length
  const next = renderItem(state.items[state.index], state.config)
  next.classList.add(direction > 0 ? 'is-entering-from-bottom' : 'is-entering-from-top')
  track.appendChild(next)
  if (state.reducedMotion) {
    current.remove()
    next.classList.remove('is-entering-from-bottom', 'is-entering-from-top')
    next.classList.add('is-active')
    state.transitioning = false
    schedule(state)
    return
  }
  current.classList.add(direction > 0 ? 'is-leaving-to-top' : 'is-leaving-to-bottom')
  requestAnimationFrame(() => {
    next.classList.remove('is-entering-from-bottom', 'is-entering-from-top')
    next.classList.add('is-active')
  })
  state.transitionTimer = window.setTimeout(() => {
    current.remove()
    state.transitionTimer = null
    state.transitioning = false
    schedule(state)
  }, 620)
}

function syncMotionPreference(state) {
  state.reducedMotion = state.motionQuery.matches
  if (state.reducedMotion || state.userPaused || state.hovered || state.focused || state.hidden) {
    state.paused = true
    clearTimer(state)
  } else {
    state.paused = false
    schedule(state)
  }
  updateControls(state)
}

function bindControls(state) {
  const { root } = state.config
  const controller = new AbortController()
  const { signal } = controller
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-home-moments-action]')
    if (!button || !root.contains(button) || button.disabled) return
    const action = button.dataset.homeMomentsAction
    if (action === 'prev') transition(state, -1)
    if (action === 'next') transition(state, 1)
    if (action === 'toggle') {
      state.userPaused = !state.userPaused
      state.paused = state.userPaused
      if (state.paused) clearTimer(state)
      else { state.running = true; schedule(state) }
      updateControls(state)
    }
    if (action === 'refresh') void load(state, true)
  }, { signal })
  root.addEventListener('mouseenter', () => { state.hovered = true; if (!state.userPaused) { state.paused = true; clearTimer(state); updateControls(state) } }, { signal })
  root.addEventListener('mouseleave', () => { state.hovered = false; if (!state.userPaused && !state.reducedMotion) { state.paused = false; schedule(state); updateControls(state) } }, { signal })
  root.addEventListener('focusin', () => { state.focused = true; if (!state.userPaused) { state.paused = true; clearTimer(state); updateControls(state) } }, { signal })
  root.addEventListener('focusout', (event) => {
    if (root.contains(event.relatedTarget)) return
    state.focused = false
    if (!state.userPaused && !state.reducedMotion) { state.paused = false; schedule(state); updateControls(state) }
  }, { signal })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { state.hidden = true; clearTimer(state) }
    else { state.hidden = false; if (!state.userPaused && !state.reducedMotion) schedule(state) }
  }, { signal })
  const onMotionChange = () => syncMotionPreference(state)
  state.motionQuery.addEventListener?.('change', onMotionChange)
  registerPageCleanup(() => {
    controller.abort()
    state.motionQuery.removeEventListener?.('change', onMotionChange)
  })
}

async function load(state, isRefresh = false) {
  if (state.loading) return
  state.loading = true
  state.requestId += 1
  const requestId = state.requestId
  state.controller?.abort()
  state.controller = new AbortController()
  state.mode = 'loading'
  setStatus(state)
  try {
    if (state.config.source === 'local') {
      state.items = uniqueSorted(state.localItems).slice(0, state.config.maxItems)
    } else {
      const remote = await fetchRemoteItems(state.config, state.controller.signal)
      const combined = state.config.source === 'both' ? [...state.localItems, ...remote] : remote
      state.items = uniqueSorted(combined.filter((item) => state.config.showAds || !item.isAd)).slice(0, state.config.maxItems)
    }
    if (requestId !== state.requestId) return
    state.mode = state.items.length ? 'content' : 'empty'
    state.config.root.classList.remove('is-loading')
    renderInitial(state)
    setStatus(state)
    syncMotionPreference(state)
  } catch (error) {
    if (error?.name === 'AbortError') return
    console.warn('[home-moments]', error)
    if (requestId !== state.requestId) return
    state.config.root.classList.remove('is-loading')
    if (state.config.source === 'both' && state.localItems.length) {
      state.items = uniqueSorted(state.localItems).slice(0, state.config.maxItems)
      state.mode = 'error'
      renderInitial(state)
    } else if (state.items.length) {
      state.mode = 'error'
      renderInitial(state)
    } else {
      state.mode = 'error'
      renderEmpty(state)
    }
    setStatus(state)
  } finally {
    if (requestId === state.requestId) {
      state.loading = false
      setStatus(state)
      updateControls(state)
    }
  }
}

export function initHomeMomentsTicker() {
  const root = document.querySelector('[data-home-moments-ticker]')
  if (!root || root.dataset.homeMomentsMounted === '1') return
  root.dataset.homeMomentsMounted = '1'
  const config = readConfig(root)
  const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || { matches: false }
  const state = {
    config,
    localItems: readLocalItems(root),
    items: [],
    index: 0,
    mode: config.source === 'local' ? 'content' : 'loading',
    running: config.autoPlay,
    paused: false,
    userPaused: false,
    reducedMotion: motionQuery.matches,
    motionQuery,
    timer: null,
    loading: false,
    transitioning: false,
    transitionTimer: null,
    controller: null,
    requestId: 0,
  }
  bindControls(state)
  if (config.source === 'local') {
    state.items = uniqueSorted(state.localItems).slice(0, config.maxItems)
    state.mode = state.items.length ? 'content' : 'empty'
    renderInitial(state)
    setStatus(state)
    syncMotionPreference(state)
  } else {
    root.classList.add('is-loading')
    setStatus(state)
    void load(state)
  }
  registerPageCleanup(() => {
    clearTimer(state)
    if (state.transitionTimer) window.clearTimeout(state.transitionTimer)
    state.transitionTimer = null
    state.controller?.abort()
    state.requestId += 1
    root.dataset.homeMomentsMounted = '0'
  })
}
