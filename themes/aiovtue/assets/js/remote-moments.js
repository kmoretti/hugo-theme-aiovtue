import { mountMomentCommentPanel } from './comments.js'
import { formatRelativeTime } from './utils.js'

const DEFAULT_REACTIONS = ['👍', '👎', '❤', '👀', '💩']
const MAX_RETRIES = 2
const REQUEST_TIMEOUT = 10000
const TOKEN_TTL = 4 * 60 * 1000
const FINGERPRINT_KEY = 'sakura-moments-fingerprint-token'
const ANTIBOT_KEY = 'sakura-moments-antibot-token'
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : (value == null ? fallback : String(value).trim())
}

function isHttpUrl(value, httpsOnly = false) {
  try {
    const url = new URL(String(value || '').trim())
    return (url.protocol === 'https:' || (!httpsOnly && url.protocol === 'http:'))
  } catch (_) {
    return false
  }
}

function safeUrl(value, { httpsOnly = false, allowRelative = false } = {}) {
  const raw = text(value)
  if (isHttpUrl(raw, httpsOnly)) return raw
  if (allowRelative && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return ''
}

function safeInt(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function unixToIso(value) {
  const seconds = safeInt(value, 0)
  if (seconds <= 0) return ''
  const date = new Date(seconds * 1000)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function normalizeTags(value) {
  const list = Array.isArray(value) ? value : (value == null ? [] : [value])
  return [...new Set(list.map((item) => {
    if (item && typeof item === 'object') return text(item.name || item.label)
    return text(item)
  }).filter(Boolean))].slice(0, 12)
}

function parseExtensions(value) {
  const values = Array.isArray(value) ? value : (value == null ? [] : [value])
  return values.flatMap((item) => {
    let parsed = item
    if (typeof item === 'string') {
      try { parsed = JSON.parse(item) } catch (_) { return [] }
    }
    if (!parsed || typeof parsed !== 'object') return []
    const rawType = text(parsed.type).toUpperCase()
    const typeMap = { GITHUBPROJ: 'github', WEBSITE: 'website', LOCATION: 'location', MUSIC: 'music', TWEET: 'tweet', VIDEO: 'video' }
    const type = typeMap[rawType] || rawType.toLowerCase()
    if (!type || !parsed.payload || typeof parsed.payload !== 'object') return []
    return [{ type, payload: parsed.payload }]
  })
}

function normalizeMedia(value, config) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const file = item.file && typeof item.file === 'object' ? item.file : item
    const url = safeUrl(file.url || item.media_url, { httpsOnly: true })
    if (!url || item.is_deleted || !isAllowedMediaUrl(url, config)) return []
    const type = text(file.category || file.media_type || file.content_type || file.type).toLowerCase()
    const kind = type.startsWith('video') || type === 'video' ? 'video' : (type.startsWith('image') || type === 'image' ? 'image' : (type.startsWith('audio') || type === 'audio' ? 'audio' : 'file'))
    return [{ url, kind, name: text(file.name || item.name), caption: text(file.name || item.name), width: safeInt(file.width), height: safeInt(file.height), sortOrder: safeInt(item.sort_order) }]
  }).sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 9)
}

function isAllowedMediaUrl(url, config) {
  if (config.provider !== 'ech0') return true
  try {
    const origin = new URL(url).origin
    return (config.mediaOrigins || []).includes(origin)
  } catch (_) {
    return false
  }
}

function normalizeRemoteItem(item, config) {
  if (!item || typeof item !== 'object') return null
  const id = text(item.id)
  if (!id || text(item.status, 'visible') !== 'visible') return null
  const createdAt = safeInt(item.created_at, 0)
  const updatedAt = safeInt(item.updated_at, createdAt)
  const date = unixToIso(createdAt || updatedAt)
  if (!date) return null
  const extensions = parseExtensions(item.extension)
  const isEch0 = config.provider === 'ech0'
  return {
    source: 'remote',
    sourceId: id,
    id,
    content: text(item.content),
    contentHTML: '',
    contentMode: 'markdown',
    date,
    createdAt,
    updatedAt,
    pinnedOrder: isEch0 ? 0 : Math.max(0, safeInt(item.pinned_order, 0)),
    isAd: !isEch0 && (safeInt(item.is_ad, 0) === 1 || item.is_ad === true),
    tags: normalizeTags(item.tags),
    messageLink: isEch0 ? safeUrl(`${config.remoteURL.replace(/\/$/, '')}/echo/${encodeURIComponent(id)}`, { httpsOnly: true }) : safeUrl(item.message_link),
    media: normalizeMedia(isEch0 ? item.echo_files : item.media, config),
    extensions,
    reactions: item.reactions && typeof item.reactions === 'object' ? { ...item.reactions } : {},
    selectedReaction: text(item.selected_reaction),
    favCount: Math.max(0, safeInt(item.fav_count, 0)),
    commentEnabled: config.comments,
    commentPath: isEch0 ? `ech0:${id}` : `remote:${id}`,
    commentId: `${isEch0 ? 'ech0' : 'remote'}-${id}`,
  }
}

function sanitizeTelegramHtml(value) {
  const template = document.createElement('template')
  template.innerHTML = text(value)
  const allowed = new Set(['div', 'p', 'br', 'b', 'strong', 'i', 'em', 'del', 's', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'a'])
  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent)
    if (node.nodeType !== Node.ELEMENT_NODE || !allowed.has(node.tagName.toLowerCase())) return document.createDocumentFragment()
    const element = document.createElement(node.tagName.toLowerCase())
    if (element.tagName === 'A') {
      const href = safeUrl(node.getAttribute('href'), { httpsOnly: true })
      if (href) {
        element.href = href
        element.target = '_blank'
        element.rel = 'noopener noreferrer'
      }
    }
    node.childNodes.forEach((child) => element.appendChild(sanitizeNode(child)))
    return element
  }
  const container = document.createElement('div')
  template.content.childNodes.forEach((node) => container.appendChild(sanitizeNode(node)))
  return container.innerHTML
}

function normalizeTelegramItem(item) {
  if (!item || typeof item !== 'object') return null
  const id = text(item.id)
  const date = text(item.datetime) || (() => {
    const timestamp = Number(item.timestamp)
    return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : ''
  })()
  if (!id || !date || Number.isNaN(Date.parse(date))) return null
  const media = Array.isArray(item.media) ? item.media.flatMap((mediaItem) => {
    const url = safeUrl(mediaItem?.src, { httpsOnly: true })
    return text(mediaItem?.type).toLowerCase() === 'image' && url ? [{ url, kind: 'image', name: text(mediaItem.alt), caption: text(mediaItem.alt) }] : []
  }).slice(0, 9) : []
  return {
    source: 'telegram',
    sourceId: id,
    id: `telegram-${id}`,
    content: text(item.text),
    contentHTML: sanitizeTelegramHtml(item.html),
    contentMode: 'html',
    date,
    createdAt: Date.parse(date),
    updatedAt: Date.parse(date),
    pinnedOrder: 0,
    isAd: false,
    tags: normalizeTags(item.tags),
    messageLink: safeUrl(item.source?.telegramUrl, { httpsOnly: true }),
    media,
    extensions: [],
    reactions: {},
    selectedReaction: '',
    favCount: 0,
    commentEnabled: false,
    commentPath: '',
    commentId: `telegram-${id}`,
  }
}

function normalizeLocalItem(item, config) {
  if (!item || typeof item !== 'object') return null
  const sourceId = text(item.sourceId)
  const date = text(item.dateISO)
  if (!sourceId || !date) return null
  return {
    source: 'local',
    sourceId,
    id: sourceId,
    content: text(item.content),
    contentHTML: text(item.contentHTML),
    contentMode: 'html',
    date,
    createdAt: safeInt(item.date, 0),
    updatedAt: safeInt(item.date, 0),
    pinnedOrder: 0,
    isAd: false,
    tags: [],
    messageLink: '',
    media: Array.isArray(item.photos) ? item.photos.map((photo) => ({
      url: safeUrl(photo?.url, { allowRelative: true }),
      kind: 'image',
      name: text(photo?.caption),
      caption: text(photo?.caption),
    })).filter((photo) => photo.url).slice(0, 9) : [],
    extensions: parseExtensions(item.extensions),
    reactions: {},
    selectedReaction: '',
    commentEnabled: item.commentEnabled !== false && config.comments,
    commentPath: text(item.commentPath),
    commentId: text(item.commentId, sourceId),
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

function parseConfig(root) {
  const bool = (name, fallback) => root.dataset[name] == null ? fallback : root.dataset[name] === 'true'
  const maxItems = Math.max(1, safeInt(root.dataset.momentsRemoteMaxItems, 40))
  const batchSize = Math.max(1, safeInt(root.dataset.momentsBatchSize, 5))
  return {
    root,
    source: ['remote', 'both'].includes(root.dataset.momentsSource) ? root.dataset.momentsSource : 'local',
    layout: ['cards', 'memos', 'ech0'].includes(root.dataset.momentsLayout) ? root.dataset.momentsLayout : 'memos',
    provider: root.dataset.momentsProvider === 'blog_api' ? 'blog_api' : 'ech0',
    author: text(root.dataset.momentsAuthor, document.title),
    avatar: safeUrl(root.dataset.momentsAvatar, { allowRelative: true }) || '/favicon.png',
    remoteURL: safeUrl(root.dataset.momentsRemoteUrl, { httpsOnly: true }),
    remoteEndpoint: root.dataset.momentsRemoteEndpoint || '/api/echo/query',
    cacheMinutes: Math.max(0, safeInt(root.dataset.momentsCacheMinutes, 30)),
    mediaOrigins: (() => { try { const value = JSON.parse(root.dataset.momentsMediaOrigins || '[]'); return Array.isArray(value) ? value : [] } catch (_) { return [] } })(),
    metingAPI: safeUrl(root.dataset.momentsMetingApi, { httpsOnly: true }),
    twitterWidgets: bool('momentsTwitterWidgets', true),
    signal: null,
    maxItems,
    batchSize,
    reactions: bool('momentsReactions', true),
    likes: bool('momentsLikes', true),
    reactionVerification: bool('momentsReactionVerification', true),
    comments: bool('momentsComments', true),
    sourceBadge: bool('momentsSourceBadge', true),
    tags: bool('momentsTags', true),
    messageLink: bool('momentsMessageLink', true),
    adBadge: bool('momentsAdBadge', true),
    telegram: {
      enabled: bool('momentsTelegramEnabled', false),
      url: safeUrl(root.dataset.momentsTelegramUrl, { httpsOnly: true }),
      maxItems: Math.max(1, safeInt(root.dataset.momentsTelegramMaxItems, 40)),
      pageSize: Math.max(1, Math.min(100, safeInt(root.dataset.momentsTelegramPageSize, 20))),
      cacheMinutes: Math.max(0, safeInt(root.dataset.momentsTelegramCacheMinutes, 30)),
    },
    commentProvider: root.dataset.momentsCommentProvider || 'twikoo',
  }
}

function readLocalItems(root, config) {
  const data = document.getElementById('moments-local-data')
  if (!data) return []
  try {
    let payload = JSON.parse(data.textContent || '[]')
    if (typeof payload === 'string') payload = JSON.parse(payload)
    const items = Array.isArray(payload) ? payload : payload?.items
    return (Array.isArray(items) ? items : []).map((item) => normalizeLocalItem(item, config)).filter(Boolean)
  } catch (error) {
    console.warn('[moments] local data parse failed', error)
    return []
  }
}

async function requestJson(url, options = {}, { retries = MAX_RETRIES, timeout = REQUEST_TIMEOUT } = {}) {
  let lastError = new Error('请求失败')
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutController = new AbortController()
    const externalSignal = options.signal
    const abortExternal = () => timeoutController.abort()
    externalSignal?.addEventListener('abort', abortExternal, { once: true })
    const timer = window.setTimeout(() => timeoutController.abort(), timeout)
    try {
      if (externalSignal?.aborted) throw new DOMException('请求已取消', 'AbortError')
      const { signal: _ignoredSignal, ...fetchOptions } = options
      const response = await fetch(url, { cache: 'no-store', ...fetchOptions, signal: timeoutController.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      return payload
    } catch (error) {
      if (externalSignal?.aborted) throw error
      lastError = error?.name === 'AbortError' ? new Error('远程请求超时') : error
      if (attempt < retries) await sleep(350 * (attempt + 1))
    } finally {
      window.clearTimeout(timer)
      externalSignal?.removeEventListener('abort', abortExternal)
    }
  }
  throw lastError
}

function cacheKey(config) {
  return `sakura-moments:${config.provider}:${config.remoteURL}:${config.maxItems}`
}

function readCache(config) {
  if (config.provider !== 'ech0' || config.cacheMinutes <= 0) return null
  try {
    const value = JSON.parse(localStorage.getItem(cacheKey(config)) || 'null')
    if (!value || !Array.isArray(value.items) || !Number.isFinite(value.savedAt)) return null
    return { items: value.items, fresh: Date.now() - value.savedAt < config.cacheMinutes * 60 * 1000 }
  } catch (_) { return null }
}

function writeCache(config, items) {
  if (config.provider !== 'ech0' || config.cacheMinutes <= 0) return
  try { localStorage.setItem(cacheKey(config), JSON.stringify({ savedAt: Date.now(), items })) } catch (_) {}
}

function telegramCacheKey(config) {
  return `sakura-moments:telegram:${config.telegram.url}:${config.telegram.maxItems}`
}

function readTelegramCache(config) {
  if (!config.telegram.enabled || config.telegram.cacheMinutes <= 0) return null
  try {
    const value = JSON.parse(localStorage.getItem(telegramCacheKey(config)) || 'null')
    if (!value || !Array.isArray(value.items) || !Number.isFinite(value.savedAt)) return null
    return { items: value.items, fresh: Date.now() - value.savedAt < config.telegram.cacheMinutes * 60 * 1000 }
  } catch (_) { return null }
}

function writeTelegramCache(config, items) {
  if (!config.telegram.enabled || config.telegram.cacheMinutes <= 0) return
  try { localStorage.setItem(telegramCacheKey(config), JSON.stringify({ savedAt: Date.now(), items })) } catch (_) {}
}

async function fetchTelegramMoments(config, signal) {
  if (!config.telegram.enabled) return []
  if (!config.telegram.url) throw new Error('Telegram 动态地址无效')
  const items = []
  const seen = new Set()
  let page = 1
  let hasNext = true
  while (hasNext && items.length < config.telegram.maxItems) {
    const url = new URL(config.telegram.url)
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', String(config.telegram.pageSize))
    const payload = await requestJson(url.toString(), { signal }, { retries: MAX_RETRIES })
    if (!Array.isArray(payload?.posts)) throw new Error('Telegram 动态数据格式错误')
    payload.posts.map(normalizeTelegramItem).filter(Boolean).forEach((item) => {
      if (!seen.has(item.id) && items.length < config.telegram.maxItems) { seen.add(item.id); items.push(item) }
    })
    hasNext = payload?.pagination?.hasNext === true
    page += 1
  }
  writeTelegramCache(config, items)
  return items
}

async function fetchRemotePage(config, page, signal) {
  if (!config.remoteURL) throw new Error('远程动态地址无效')
  const pageSize = Math.min(20, config.maxItems)
  let payload
  if (config.provider === 'ech0') {
    const endpoint = new URL(config.remoteEndpoint, `${config.remoteURL.replace(/\/$/, '')}/`).toString()
    payload = await requestJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ page, pageSize, search: '', tagIds: [], sortBy: 'created_at', sortOrder: 'desc' }), signal: signal }, { retries: MAX_RETRIES })
    if (payload?.code !== 1 || !Array.isArray(payload?.data?.items)) throw new Error('Ech0 动态数据格式错误')
  } else {
    const url = new URL(config.remoteURL)
    url.searchParams.set('page', String(page))
    url.searchParams.set('page_size', String(pageSize))
    payload = await requestJson(url.toString(), { signal: signal }, { retries: MAX_RETRIES })
    if (payload?.code !== 200 || !Array.isArray(payload?.data?.items)) throw new Error('远程动态数据格式错误')
  }
  const rawItems = payload.data.items
  return {
    items: rawItems.map((item) => normalizeRemoteItem(item, config)).filter(Boolean),
    total: Math.max(0, safeInt(payload.data.total, rawItems.length)),
    pageSize,
    hasMore: rawItems.length >= pageSize,
  }
}

async function fetchRemoteMoments(config, signal) {
  const first = await fetchRemotePage(config, 1, signal)
  const normalized = first.items.slice(0, config.maxItems)
  if (config.provider === 'ech0') writeCache(config, normalized)
  return { items: normalized, total: first.total, page: 1, pageSize: first.pageSize, hasMore: first.hasMore && normalized.length < first.total && normalized.length < config.maxItems }
}

function createTextNode(value) {
  return document.createTextNode(String(value || ''))
}

function appendInline(container, value, options = {}) {
  const source = String(value || '')
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|`([^`]+)`|\*([^*]+)\*|_([^_]+)_/g
  let cursor = 0
  let match
  while ((match = pattern.exec(source))) {
    if (match.index > cursor) container.appendChild(createTextNode(source.slice(cursor, match.index)))
    if (match[1] !== undefined) {
      const url = safeUrl(match[2], { httpsOnly: true, allowRelativeImages: options.allowRelativeImages })
      if (url) {
        const image = document.createElement('img')
        image.src = url
        image.alt = match[1] || '动态图片'
        image.loading = 'lazy'
        image.decoding = 'async'
        container.appendChild(image)
      } else container.appendChild(createTextNode(match[0]))
    } else if (match[3] !== undefined) {
      const url = safeUrl(match[4])
      if (url) {
        const link = document.createElement('a')
        link.href = url
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        appendInline(link, match[3], options)
        container.appendChild(link)
      } else container.appendChild(createTextNode(match[3]))
    } else {
      const content = match[5] ?? match[6] ?? match[7] ?? match[8] ?? match[9] ?? match[10] ?? ''
      const node = document.createElement(match[5] || match[6] ? 'strong' : match[7] ? 'del' : match[8] ? 'code' : 'em')
      if (match[8]) node.appendChild(createTextNode(content))
      else appendInline(node, content, options)
      container.appendChild(node)
    }
    cursor = pattern.lastIndex
  }
  if (cursor < source.length) container.appendChild(createTextNode(source.slice(cursor)))
}

function renderMarkdown(container, markdown, options = {}) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n')
  let paragraph = []
  let list = null
  let quote = null
  let code = null
  const flushParagraph = () => {
    if (!paragraph.length) return
    const p = document.createElement('p')
    paragraph.forEach((line, index) => {
      if (index) p.appendChild(document.createElement('br'))
      appendInline(p, line, options)
    })
    container.appendChild(p)
    paragraph = []
  }
  const flushList = () => { if (list) { container.appendChild(list); list = null } }
  const flushQuote = () => { if (quote) { container.appendChild(quote); quote = null } }
  for (const line of lines) {
    if (code) {
      if (/^\s*```/.test(line)) {
        const pre = document.createElement('pre')
        const codeEl = document.createElement('code')
        codeEl.textContent = code.join('\n')
        pre.appendChild(codeEl)
        container.appendChild(pre)
        code = null
      } else code.push(line)
      continue
    }
    if (/^\s*```/.test(line)) {
      flushParagraph(); flushList(); flushQuote(); code = []
      continue
    }
    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/)
    if (heading) {
      flushParagraph(); flushList(); flushQuote()
      const el = document.createElement(`h${heading[1].length}`)
      appendInline(el, heading[2], options)
      container.appendChild(el)
      continue
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph(); flushList(); flushQuote(); container.appendChild(document.createElement('hr')); continue
    }
    const quoteLine = line.match(/^\s*>\s?(.*)$/)
    if (quoteLine) {
      flushParagraph(); flushList()
      if (!quote) quote = document.createElement('blockquote')
      appendInline(quote, quoteLine[1], options)
      quote.appendChild(document.createElement('br'))
      continue
    }
    flushQuote()
    const listLine = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/)
    if (listLine) {
      flushParagraph()
      const ordered = /\d+\./.test(listLine[1])
      if (!list || list.tagName.toLowerCase() !== (ordered ? 'ol' : 'ul')) {
        flushList(); list = document.createElement(ordered ? 'ol' : 'ul')
      }
      const li = document.createElement('li')
      appendInline(li, listLine[2], options)
      list.appendChild(li)
      continue
    }
    flushList()
    if (!line.trim()) { flushParagraph(); continue }
    paragraph.push(line)
  }
  if (code) {
    const pre = document.createElement('pre'); const codeEl = document.createElement('code')
    codeEl.textContent = code.join('\n'); pre.appendChild(codeEl); container.appendChild(pre)
  }
  flushParagraph(); flushList(); flushQuote()
}

function createMedia(entry, config) {
  if (!entry.media?.length) return null
  const grid = document.createElement('div')
  grid.className = `moments-media moments-media--count-${entry.media.length}`
  entry.media.forEach((media, index) => {
    const url = safeUrl(media.url, { httpsOnly: true, allowRelative: entry.source === 'local' })
    if (!url) return
    if (media.kind === 'video') {
      const wrapper = document.createElement('div')
      wrapper.className = 'moments-media__item moments-media__item--video'
      const video = document.createElement('video')
      video.src = url; video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.loading = 'lazy'
      video.setAttribute('aria-label', media.name || `动态视频 ${index + 1}`)
      wrapper.appendChild(video); grid.appendChild(wrapper)
      return
    }
    if (media.kind === 'audio') {
      const wrapper = document.createElement('div'); wrapper.className = 'moments-media__item moments-media__item--audio'
      const audio = document.createElement('audio'); audio.src = url; audio.controls = true; audio.preload = 'none'; audio.setAttribute('aria-label', media.name || `动态音频 ${index + 1}`)
      wrapper.appendChild(audio); grid.appendChild(wrapper); return
    }
    if (media.kind === 'file') {
      const link = document.createElement('a'); link.className = 'moments-media__file'; link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = media.name || '下载文件'; grid.appendChild(link); return
    }
    const button = document.createElement('button')
    button.type = 'button'; button.className = config?.layout === 'cards' || config?.layout === 'ech0' ? 'moments-media__item moments-card__photo' : 'moments-media__item travel-moment__photo'; button.dataset.mediaSrc = url
    button.setAttribute('aria-label', `查看动态图片 ${index + 1}`)
    const image = document.createElement('img')
    image.src = url; image.alt = media.name || `动态图片 ${index + 1}`; image.loading = 'lazy'; image.decoding = 'async'
    button.appendChild(image); grid.appendChild(button)
  })
  return grid.children.length ? grid : null
}

function extensionLink(parent, label, url, className = '') {
  const safe = safeUrl(url)
  if (!safe) return false
  const link = document.createElement('a')
  link.className = className; link.href = safe; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.appendChild(createTextNode(label))
  parent.appendChild(link)
  return true
}

function extensionCard(extension) {
  const payload = extension.payload || {}
  const card = document.createElement('div')
  card.className = `moments-extension moments-extension--${extension.type}`
  const title = document.createElement('strong')
  const body = document.createElement('span')
  if (extension.type === 'github') {
    title.appendChild(createTextNode('GitHub 仓库'))
    const repoUrl = payload.repoUrl || payload.repo_url
    const url = safeUrl(repoUrl, { httpsOnly: true })
    body.appendChild(createTextNode(text(repoUrl, '仓库链接不可用')))
    if (url) extensionLink(card, '查看仓库', url, 'moments-extension__link')
  } else if (extension.type === 'website') {
    title.appendChild(createTextNode(text(payload.title, '网站链接')))
    body.appendChild(createTextNode(text(payload.site, '')))
    extensionLink(card, '打开网站', payload.site, 'moments-extension__link')
  } else if (extension.type === 'location') {
    title.appendChild(createTextNode('位置'))
    body.appendChild(createTextNode(text(payload.placeholder || payload.name, '地点')))
    const lat = Number(payload.latitude); const lng = Number(payload.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lng)) body.appendChild(createTextNode(` · ${lat.toFixed(4)}, ${lng.toFixed(4)}`))
    const mapUrl = Number.isFinite(lat) && Number.isFinite(lng) ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=16/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}` : ''
    if (mapUrl) {
      extensionLink(card, '在地图中查看', mapUrl, 'moments-extension__link')
      const attribution = document.createElement('small'); attribution.className = 'moments-extension__attribution'; attribution.textContent = '© OpenStreetMap contributors'; card.appendChild(attribution)
    }
  } else if (extension.type === 'music') {
    title.appendChild(createTextNode('音乐'))
    body.appendChild(createTextNode(text(payload.title || payload.name, '音乐链接')))
    card.dataset.musicUrl = safeUrl(payload.url, { httpsOnly: true })
    card.dataset.musicTitle = text(payload.title || payload.name)
    extensionLink(card, '打开音乐链接', payload.url, 'moments-extension__link')
  } else if (extension.type === 'tweet') {
    title.appendChild(createTextNode('X / Twitter'))
    body.appendChild(createTextNode(text(payload.username, '原动态')))
    const url = safeUrl(payload.url, { httpsOnly: true })
    if (url) { card.dataset.tweetUrl = url; extensionLink(card, '查看原动态', url, 'moments-extension__link') }
  } else if (extension.type === 'video') {
    const videoId = text(payload.videoId)
    title.appendChild(createTextNode(videoId.startsWith('BV') ? 'Bilibili' : 'YouTube'))
    body.appendChild(createTextNode(videoId ? '视频扩展' : '视频链接不可用'))
    const url = videoId.startsWith('BV') ? `https://www.bilibili.com/video/${encodeURIComponent(videoId)}` : (videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '')
    if (url) extensionLink(card, '打开视频', url, 'moments-extension__link')
  } else return null
  card.prepend(title); card.appendChild(body)
  return card
}

function createExtensions(entry) {
  if (!entry.extensions?.length) return null
  const wrap = document.createElement('div'); wrap.className = 'moments-extensions'
  entry.extensions.forEach((extension) => { const card = extensionCard(extension); if (card) wrap.appendChild(card) })
  return wrap.children.length ? wrap : null
}

function parseMusicQuery(url) {
  try {
    const parsed = new URL(url)
    const hash = new URLSearchParams(parsed.hash.split('?')[1] || '')
    const query = parsed.searchParams
    const id = hash.get('id') || query.get('id')
    if (!id) return null
    const server = parsed.hostname.includes('qq.com') ? 'tencent' : parsed.hostname.includes('kuwo') ? 'kugou' : 'netease'
    return { server, type: 'song', id }
  } catch (_) { return null }
}

async function hydrateMusicCard(card, config) {
  if (card.dataset.musicLoaded === '1') return
  const source = card.dataset.musicUrl
  const query = source && parseMusicQuery(source)
  if (!query || !config.metingAPI) return
  card.dataset.musicLoaded = '1'
  try {
    const endpoint = new URL(config.metingAPI)
    endpoint.search = new URLSearchParams({ ...query, auth: '', r: String(Math.random()) }).toString()
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: config.signal })
    if (!response.ok) throw new Error(`Meting HTTP ${response.status}`)
    const payload = await response.json()
    const track = Array.isArray(payload) ? payload[0] : payload
    const audioUrl = safeUrl(track?.url, { httpsOnly: true })
    if (!audioUrl) return
    const player = document.createElement('div'); player.className = 'moments-music-player'
    const label = document.createElement('strong'); label.textContent = text(track.name || card.dataset.musicTitle, '音乐')
    const artist = document.createElement('span'); artist.textContent = text(track.artist)
    const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = audioUrl; audio.setAttribute('aria-label', '播放音乐')
    player.append(label, artist, audio)
    card.appendChild(player)
  } catch (error) { console.warn('[moments-music]', error) }
}

let twitterScriptPromise = null
function loadTwitterScript() {
  if (window.twttr?.widgets) return Promise.resolve(window.twttr)
  if (twitterScriptPromise) return twitterScriptPromise
  twitterScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-moments-twitter]')
    if (existing) { existing.addEventListener('load', () => resolve(window.twttr), { once: true }); existing.addEventListener('error', reject, { once: true }); return }
    const script = document.createElement('script'); script.src = 'https://platform.twitter.com/widgets.js'; script.async = true; script.charset = 'utf-8'; script.dataset.momentsTwitter = 'true'
    script.onload = () => window.twttr?.widgets ? resolve(window.twttr) : reject(new Error('Twitter widgets 不可用'))
    script.onerror = reject; document.head.appendChild(script)
  })
  return twitterScriptPromise
}

async function hydrateTweetCard(card, config) {
  if (!config.twitterWidgets || card.dataset.tweetLoaded === '1') return
  const url = card.dataset.tweetUrl
  if (!url) return
  card.dataset.tweetLoaded = '1'
  try {
    const twttr = await loadTwitterScript()
    const quote = document.createElement('blockquote'); quote.className = 'twitter-tweet'; const link = document.createElement('a'); link.href = url; quote.appendChild(link)
    card.appendChild(quote)
    twttr.widgets.load(card)
  } catch (_) { card.dataset.tweetLoaded = 'fallback' }
}

function hydrateExtensions(root, config) {
  root.__momentsExtensionObservers?.forEach((observer) => observer.disconnect())
  root.__momentsExtensionObservers = []
  root.querySelectorAll('[data-music-url], [data-tweet-url]').forEach((card) => {
    const run = () => {
      if (card.dataset.musicUrl) void hydrateMusicCard(card, config)
      if (card.dataset.tweetUrl) void hydrateTweetCard(card, config)
    }
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((records) => { if (records.some((record) => record.isIntersecting)) { observer.disconnect(); run() } }, { rootMargin: '240px' })
      root.__momentsExtensionObservers.push(observer)
      observer.observe(card)
    } else run()
  })
}

function createComments(entry, config) {
  if (!entry.commentEnabled || (entry.source === 'remote' && !config.comments)) return null
  const id = text(entry.commentId).replace(/[^a-zA-Z0-9_-]/g, '-')
  const panel = document.createElement('div')
  panel.className = 'moment-comment-panel'; panel.id = `moment-comment-${id}`
  panel.dataset.commentId = id; panel.dataset.commentPath = entry.commentPath || `remote:${entry.sourceId}`; panel.dataset.commentProvider = entry.source === 'remote' && config.provider === 'ech0' ? 'ech0' : config.commentProvider
  panel.dataset.echoId = entry.source === 'remote' && config.provider === 'ech0' ? entry.sourceId : ''
  panel.hidden = true
  const inner = document.createElement('div')
  inner.className = 'moment-comment-panel__inner moment-comment-host sakura-comment sakura-comment--moment'; inner.dataset.commentProvider = panel.dataset.commentProvider
  if (panel.dataset.commentProvider === 'ech0') {
    inner.innerHTML = '<p class="ech0-comments__status">展开后加载公开评论…</p><div class="ech0-comments__list"></div>'
  } else if (config.commentProvider === 'waline') {
    const root = document.createElement('div'); root.id = `waline-moment-${id}`; root.className = 'sakura-waline moment-comment-root'; root.dataset.placeholder = '分享你的想法...'; inner.appendChild(root)
  } else {
    const twikoo = document.createElement('div'); twikoo.className = 'sakura-twikoo'
    const root = document.createElement('div'); root.id = `tcomment-moment-${id}`; root.className = 'moment-comment-root'; twikoo.appendChild(root); inner.appendChild(twikoo)
  }
  panel.appendChild(inner)
  return panel
}

async function loadEch0Comments(panel, config) {
  if (panel.dataset.loaded === '1') return
  const status = panel.querySelector('.ech0-comments__status')
  const list = panel.querySelector('.ech0-comments__list')
  try {
    const endpoint = new URL('/api/comments', config.remoteURL)
    endpoint.searchParams.set('echo_id', panel.dataset.echoId)
    const payload = await requestJson(endpoint.toString(), { signal: config.signal }, { retries: 1 })
    const comments = Array.isArray(payload?.data) ? payload.data : []
    list?.replaceChildren()
    if (!comments.length) {
      if (status) status.textContent = '暂无公开评论'
    } else {
      comments.forEach((comment) => {
        const item = document.createElement('article'); item.className = 'ech0-comments__item'
        const head = document.createElement('strong'); head.textContent = text(comment.nickname, '访客')
        const body = document.createElement('p'); body.textContent = text(comment.content)
        item.append(head, body); list?.appendChild(item)
      })
      if (status) status.textContent = `公开评论 ${comments.length} 条`
    }
    panel.dataset.loaded = '1'
  } catch (_) {
    if (status) status.textContent = '评论暂时无法加载'
  }
}

function createReactionGroup(entry, config) {
  if (entry.source !== 'remote') return null
  if (config.provider === 'ech0') {
    if (!config.likes) return null
    const wrap = document.createElement('div'); wrap.className = 'moments-reactions moments-likes'; wrap.dataset.momentId = String(entry.id)
    const button = document.createElement('button'); button.type = 'button'; button.className = 'moments-like'; button.dataset.momentLike = 'true'; button.setAttribute('aria-label', '点赞这条说说')
    button.textContent = `♡ ${entry.favCount}`
    wrap.appendChild(button)
    const note = document.createElement('small'); note.className = 'moments-reactions__note'; note.textContent = 'Ech0 点赞仅支持单向添加'; wrap.appendChild(note)
    return wrap
  }
  if (!config.reactions) return null
  const wrap = document.createElement('div'); wrap.className = 'moments-reactions';
  wrap.dataset.momentId = String(entry.id)
  const list = document.createElement('div'); list.className = 'moments-reactions__list'; list.setAttribute('aria-label', '动态 reactions')
  DEFAULT_REACTIONS.forEach((reaction) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'moments-reaction'; button.dataset.reaction = reaction
    button.setAttribute('aria-label', `Reaction ${reaction}`); button.setAttribute('aria-pressed', entry.selectedReaction === reaction ? 'true' : 'false')
    if (entry.selectedReaction === reaction) button.classList.add('is-selected')
    const count = safeInt(entry.reactions?.[reaction], 0)
    button.appendChild(createTextNode(`${reaction} ${count}`)); list.appendChild(button)
  })
  wrap.appendChild(list)
  const note = document.createElement('small'); note.className = 'moments-reactions__note'; note.textContent = 'Reaction 由远程动态服务处理'; wrap.appendChild(note)
  return wrap
}

function createEntry(entry, index, config) {
  const article = document.createElement('article')
  const isEch0 = config.layout === 'ech0'
  article.className = isEch0 || config.layout === 'cards' ? `moments-card${isEch0 ? ' moments-card--ech0' : ''}` : 'travel-moment'
  article.id = `moments-entry-${index}`; article.dataset.entryKey = `${entry.source}:${entry.sourceId}`; article.dataset.momentSource = entry.source; article.dataset.momentId = entry.sourceId
  if (config.layout === 'memos') {
    const avatar = document.createElement('img'); avatar.className = 'travel-moment__avatar'; avatar.src = config.avatar; avatar.alt = ''; avatar.width = 42; avatar.height = 42; avatar.loading = 'lazy'; avatar.decoding = 'async'; article.appendChild(avatar)
  }
  const main = config.layout === 'cards' || isEch0 ? article : document.createElement('div')
  if (config.layout !== 'cards' && !isEch0) main.className = 'travel-moment__main'
  if (config.layout === 'memos') { const name = document.createElement('p'); name.className = 'travel-moment__name'; name.textContent = config.author; main.appendChild(name) }
  if (isEch0) { const name = document.createElement('p'); name.className = 'moments-card__author'; name.textContent = config.author; main.appendChild(name) }
  const meta = document.createElement('p'); meta.className = config.layout === 'cards' || isEch0 ? 'moments-card__meta' : 'travel-moment__meta'
  const timeEl = document.createElement('time'); timeEl.dateTime = entry.date; timeEl.dataset.absolute = new Date(entry.date).toLocaleString('zh-CN'); timeEl.textContent = timeEl.dataset.absolute; meta.appendChild(timeEl)
  if (config.sourceBadge) { const badge = document.createElement('span'); badge.className = `moments-source-badge moments-source-badge--${entry.source}`; badge.textContent = entry.source === 'remote' ? (config.provider === 'ech0' ? 'Ech0' : '远程') : (entry.source === 'telegram' ? 'Telegram' : '本地'); meta.appendChild(badge) }
  if (entry.isAd && config.adBadge) { const badge = document.createElement('span'); badge.className = 'moments-ad-badge'; badge.textContent = '推广'; meta.appendChild(badge) }
  if (config.layout === 'cards' || isEch0) main.appendChild(meta)
  const textEl = document.createElement('div')
  textEl.className = config.layout === 'cards' || isEch0 ? 'moments-card__text moment-prose' : 'travel-moment__text moment-prose'
  if ((entry.source === 'local' || entry.source === 'telegram') && entry.contentHTML) textEl.innerHTML = entry.contentHTML
  else renderMarkdown(textEl, entry.content, { allowRelativeImages: entry.source === 'local' })
  if (entry.content || entry.contentHTML) main.appendChild(textEl)
  const media = createMedia(entry, config); if (media) { media.className += config.layout === 'cards' || isEch0 ? ' moments-card__photos' : ' travel-moment__photos'; main.appendChild(media) }
  const extensions = createExtensions(entry); if (extensions) main.appendChild(extensions)
  if ((entry.source === 'remote' || entry.source === 'telegram') && config.tags && entry.tags.length) { const tags = document.createElement('div'); tags.className = 'moments-tags'; entry.tags.forEach((tag) => { const el = document.createElement('span'); el.textContent = tag; tags.appendChild(el) }); main.appendChild(tags) }
  if ((entry.source === 'remote' || entry.source === 'telegram') && config.messageLink && entry.messageLink) extensionLink(main, '查看原消息', entry.messageLink, 'moments-message-link')
  const reaction = createReactionGroup(entry, config); if (reaction) main.appendChild(reaction)
  const footer = document.createElement('div'); footer.className = config.layout === 'cards' || isEch0 ? 'moments-card__footer' : 'travel-moment__footer'
  if (config.layout === 'memos') footer.prepend(meta)
  const panel = createComments(entry, config)
  if (entry.commentEnabled && panel) {
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'moment-comment-toggle'; toggle.dataset.commentId = panel.dataset.commentId; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', panel.id)
    toggle.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l-4-4h14c1.1 0 2-.9 2-2V4c0-1.1.9-2 2-2m0 14H6l-2 2V4h16v12z"/></svg><span>评论</span>'
    footer.appendChild(toggle)
  }
  main.appendChild(footer); if (panel) main.appendChild(panel)
  if (config.layout !== 'cards' && !isEch0) article.appendChild(main)
  return article
}

function setStatus(root, mode, message = '') {
  const status = root.querySelector('.moments-remote-status')
  const refresh = root.querySelector('[data-moments-action="refresh"]')
  if (!status) return
  status.hidden = mode === 'content' && !message
  status.className = `moments-feed__status moments-remote-status is-${mode}`
  status.textContent = message || ({ loading: '正在加载远程动态…', empty: '暂时没有远程动态。', error: '远程动态暂时无法加载，请稍后重试。' }[mode] || '')
  if (refresh) { refresh.hidden = !['content', 'error', 'empty'].includes(mode); refresh.disabled = mode === 'loading'; refresh.textContent = mode === 'loading' ? '加载中…' : '刷新远程动态' }
}

function renderFeed(root, entries, config, options = {}) {
  const feed = root.querySelector('.moments-feed')
  if (!feed) return
  feed.replaceChildren()
  if (!entries.length) { const empty = document.createElement('p'); empty.className = 'moments-feed__empty'; empty.textContent = options.emptyMessage || '暂时没有动态。'; feed.appendChild(empty); return }
  const queue = entries.slice(); let index = 0; let observer
  const load = () => {
    if (!queue.length) { observer?.disconnect(); return }
    const fragment = document.createDocumentFragment()
    queue.splice(0, config.batchSize).forEach((entry) => fragment.appendChild(createEntry(entry, index++, config)))
    feed.insertBefore(fragment, sentinel)
    bindEntryInteractions(root)
    hydrateExtensions(root, config)
    initTimes(feed)
    if (!queue.length) { observer?.disconnect(); const done = document.createElement('p'); done.className = 'moments-feed__status is-done'; done.textContent = '没有更多了'; feed.appendChild(done); return }
    if (sentinel.getBoundingClientRect().top <= window.innerHeight) load()
  }
  const sentinel = document.createElement('div'); sentinel.className = 'moments-feed__sentinel'; sentinel.setAttribute('aria-hidden', 'true'); feed.appendChild(sentinel)
  observer = new IntersectionObserver((records) => { if (records.some((record) => record.isIntersecting)) load() }, { rootMargin: '240px 0px 0px' })
  observer.observe(sentinel)
  load()
  root.__momentsRemoteObserver = observer
}

function initTimes(root) {
  root.querySelectorAll('time[datetime]').forEach((timeEl) => {
    const absolute = timeEl.dataset.absolute || timeEl.textContent.trim()
    const formatted = formatRelativeTime(timeEl.dateTime, absolute, false)
    timeEl.textContent = formatted
    if (formatted !== absolute) timeEl.title = absolute
  })
}

function makeCommentHandler(root) {
  return async (event) => {
    const toggle = event.target.closest('.moment-comment-toggle')
    if (!toggle || !root.contains(toggle)) return
    const entry = toggle.closest('.moments-card, .travel-moment'); const panel = entry?.querySelector('.moment-comment-panel')
    if (!panel) return
    const wasOpen = !panel.hidden
    root.querySelectorAll('.moment-comment-panel').forEach((item) => { item.hidden = true })
    root.querySelectorAll('.moment-comment-toggle').forEach((item) => { item.setAttribute('aria-expanded', 'false'); item.classList.remove('is-active') })
    if (wasOpen) return
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); toggle.classList.add('is-active')
    if (panel.dataset.commentProvider === 'ech0') await loadEch0Comments(panel, root.__momentsConfig)
    else if (panel.dataset.loaded !== '1') { await mountMomentCommentPanel(panel); panel.dataset.loaded = '1' }
  }
}

function updateReactionButtons(group, entry, selected) {
  const previous = entry.selectedReaction
  if (previous && previous !== selected) entry.reactions[previous] = Math.max(0, safeInt(entry.reactions[previous], 0) - 1)
  if (selected && selected !== previous) entry.reactions[selected] = safeInt(entry.reactions[selected], 0) + 1
  entry.selectedReaction = selected
  group.querySelectorAll('.moments-reaction').forEach((button) => {
    const isSelected = button.dataset.reaction === selected
    button.classList.toggle('is-selected', isSelected); button.setAttribute('aria-pressed', String(isSelected))
    const count = safeInt(entry.reactions?.[button.dataset.reaction], 0)
    button.textContent = `${button.dataset.reaction} ${count}`
  })
}

function bindEntryInteractions(root) {
  if (root.__momentsInteractionBound) return
  root.__momentsInteractionBound = true
  const controller = new AbortController(); root.__momentsInteractionController = controller
  root.addEventListener('click', async (event) => {
    await makeCommentHandler(root)(event)
    const likeButton = event.target.closest('[data-moment-like="true"]')
    if (likeButton && root.contains(likeButton)) {
      const group = likeButton.closest('.moments-likes'); const id = group?.dataset.momentId
      const entry = root.__momentsEntries?.find((item) => String(item.id) === id)
      if (!group || !entry || likeButton.disabled) return
      likeButton.disabled = true
      try {
        const changed = await root.__momentsReactionClient.like(id)
        if (changed) { entry.favCount += 1; likeButton.textContent = `♥ ${entry.favCount}`; likeButton.classList.add('is-liked') }
      } catch (error) { console.warn('[ech0-like]', error); group.classList.add('is-error') }
      finally { likeButton.disabled = false }
      return
    }
    const button = event.target.closest('.moments-reaction')
    if (!button || !root.contains(button)) return
    const group = button.closest('.moments-reactions'); const id = group?.dataset.momentId
    const entry = root.__momentsEntries?.find((item) => String(item.id) === id)
    if (!group || !entry || button.disabled || root.__momentsConfig?.provider === 'ech0') return
    const reaction = button.dataset.reaction; button.disabled = true
    try { await root.__momentsReactionClient.toggle(id, reaction, entry.selectedReaction); updateReactionButtons(group, entry, entry.selectedReaction === reaction ? '' : reaction) }
    catch (error) { console.warn('[moments-reaction]', error); group.classList.add('is-error'); window.setTimeout(() => group.classList.remove('is-error'), 2500) }
    finally { button.disabled = false }
  }, { signal: controller.signal })
}

function storageGet(key) { try { return sessionStorage.getItem(key) || '' } catch (_) { return '' } }
function storageSet(key, value) { try { sessionStorage.setItem(key, value) } catch (_) {} }
function storageRemove(key) { try { sessionStorage.removeItem(key) } catch (_) {} }

function apiOrigin(url) { try { return new URL(url).origin } catch (_) { return '' } }

function createEch0LikeClient(config) {
  const voted = new Set()
  return {
    async like(id) {
      if (voted.has(id)) return false
      const endpoint = new URL(`/api/echo/like/${encodeURIComponent(id)}`, config.remoteURL)
      const payload = await requestJson(endpoint.toString(), { method: 'PUT', headers: { Accept: 'application/json' } }, { retries: 1 })
      if (payload?.code !== 1) throw new Error('Ech0 点赞失败')
      voted.add(id)
      return true
    },
  }
}

function createReactionClient(config, root) {
  const base = apiOrigin(config.remoteURL)
  let antiBot = storageGet(ANTIBOT_KEY)
  let antiBotAt = antiBot ? Date.now() : 0
  let fingerprint = storageGet(FINGERPRINT_KEY)
  let privacyShown = false
  let activeDialog = null
  const call = (path, options = {}) => requestJson(`${base}${path}`, options, { retries: 0, timeout: REQUEST_TIMEOUT })
  const showPrivacy = () => {
    if (privacyShown) return
    privacyShown = true
    const note = root.querySelector('.moments-reactions__note')
    if (note) note.textContent = '点击表情即表示同意将必要的设备标识发送到远程动态服务，用于防刷。'
  }
  const loadTurnstile = () => new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`)
    if (existing) { existing.addEventListener('load', () => resolve(window.turnstile), { once: true }); existing.addEventListener('error', () => reject(new Error('人机验证组件加载失败')), { once: true }); return }
    const script = document.createElement('script'); script.src = TURNSTILE_SCRIPT; script.async = true; script.defer = true; script.dataset.momentsTurnstile = 'true'; script.onload = () => resolve(window.turnstile); script.onerror = () => reject(new Error('人机验证组件加载失败')); document.head.appendChild(script)
  })
  const askTurnstile = async (siteKey) => {
    if (!siteKey) throw new Error('远程验证缺少 Site Key')
    const dialog = document.createElement('dialog'); dialog.className = 'moments-verification-modal'
    dialog.setAttribute('aria-labelledby', 'moments-verification-title')
    dialog.innerHTML = '<form method="dialog"><button type="submit" class="moments-verification-modal__close" aria-label="关闭">×</button></form><h2 id="moments-verification-title">完成安全验证后继续</h2><div class="moments-turnstile-widget"></div><p class="moments-verification-modal__error" role="status" hidden></p>'
    document.body.appendChild(dialog); activeDialog = dialog
    const cleanup = () => { activeDialog = null; dialog.remove() }
    dialog.showModal?.()
    try {
      const api = await loadTurnstile()
      return await new Promise((resolve, reject) => {
        let widget = null
        let settled = false
        const errorEl = dialog.querySelector('.moments-verification-modal__error')
        const finish = (fn, value) => { if (settled) return; settled = true; fn(value) }
        const render = () => {
          if (widget !== null) api.remove?.(widget)
          errorEl.hidden = true
          widget = api.render(dialog.querySelector('.moments-turnstile-widget'), {
            sitekey: siteKey,
            callback: (value) => finish(resolve, value),
            'error-callback': () => { errorEl.textContent = '验证失败，请重试。'; errorEl.hidden = false },
            'expired-callback': () => { errorEl.textContent = '验证已过期，请重试。'; errorEl.hidden = false },
          })
        }
        render()
        dialog.addEventListener('close', () => { api.remove?.(widget); finish(reject, new Error('已取消验证')) }, { once: true })
      }).finally(cleanup)
    } catch (error) { cleanup(); throw error }
  }
  const getAntiBot = async () => {
    if (antiBot && Date.now() - antiBotAt < TOKEN_TTL) return antiBot
    const verifyConfig = config.reactionVerification ? await call('/api/public/verify_conf') : null
    let turnstileToken = ''
    if (verifyConfig?.data?.turnstile?.enable) turnstileToken = await askTurnstile(text(verifyConfig.data.turnstile.site_key))
    const headers = { 'Content-Type': 'application/json' }
    if (turnstileToken) headers['X-Turnstile-Token'] = turnstileToken
    const payload = await call('/api/verify/turnstile', { method: 'POST', headers, body: JSON.stringify(turnstileToken ? { turnstile_token: turnstileToken } : {}) })
    antiBot = text(payload?.data?.antibot_token)
    if (!antiBot) throw new Error('远程验证令牌获取失败')
    antiBotAt = Date.now(); storageSet(ANTIBOT_KEY, antiBot); return antiBot
  }
  const getFingerprint = async (token) => {
    if (fingerprint) return fingerprint
    const payload = await call('/api/verify/fingerprint', { method: 'POST', headers: { 'X-Antibot-Token': token } })
    fingerprint = text(payload?.data?.fingerprint_token)
    if (!fingerprint) throw new Error('设备验证令牌获取失败')
    storageSet(FINGERPRINT_KEY, fingerprint); return fingerprint
  }
  const sendReaction = async (id, reaction, method, antiBotToken, fingerprintToken) => {
    const headers = { 'Content-Type': 'application/json', 'X-Antibot-Token': antiBotToken, 'X-Fingerprint-Token': fingerprintToken }
    try {
      await call(`/api/public/moments/${encodeURIComponent(id)}/reactions`, { method, headers, body: JSON.stringify({ reaction }) })
    } catch (error) {
      if (String(error.message).includes('HTTP 404') || String(error.message).includes('HTTP 409')) return
      throw error
    }
  }
  const toggle = async (id, reaction, selected) => {
    showPrivacy()
    const antiBotToken = await getAntiBot(); const fingerprintToken = await getFingerprint(antiBotToken)
    const submit = () => selected === reaction
      ? sendReaction(id, reaction, 'DELETE', antiBotToken, fingerprintToken)
      : (selected
        ? sendReaction(id, selected, 'DELETE', antiBotToken, fingerprintToken).then(() => sendReaction(id, reaction, 'POST', antiBotToken, fingerprintToken))
        : sendReaction(id, reaction, 'POST', antiBotToken, fingerprintToken))
    try { await submit() }
    catch (error) {
      if (String(error.message).includes('HTTP 401')) {
        storageRemove(ANTIBOT_KEY); storageRemove(FINGERPRINT_KEY); antiBot = ''; fingerprint = ''
        const retryAntiBot = await getAntiBot(); const retryFingerprint = await getFingerprint(retryAntiBot)
        if (selected && selected !== reaction) await sendReaction(id, selected, 'DELETE', retryAntiBot, retryFingerprint)
        await sendReaction(id, reaction, selected === reaction ? 'DELETE' : 'POST', retryAntiBot, retryFingerprint)
        return
      }
      throw error
    }
  }
  return { toggle }
}

export async function initRemoteMomentsPage(root) {
  const config = parseConfig(root)
  const controller = new AbortController(); root.__momentsRemoteController = controller
  const local = readLocalItems(root, config)
  root.__momentsEntries = []
  config.signal = controller.signal
  root.__momentsConfig = config
  root.__momentsReactionClient = config.provider === 'ech0' ? createEch0LikeClient(config) : createReactionClient(config, root)
  const refreshButton = root.querySelector('[data-moments-action="refresh"]')
  const loadMoreButton = root.querySelector('[data-moments-action="load-more"]')
  let observer = null
  let remoteState = { items: [], total: 0, page: 0, pageSize: 0, hasMore: false }
  let telegramItems = []
  const remoteEnabled = config.source === 'remote' || config.source === 'both'

  const updateLoadMore = () => {
    if (!loadMoreButton) return
    loadMoreButton.hidden = !remoteEnabled || config.provider !== 'ech0' || !remoteState.hasMore
    loadMoreButton.disabled = remoteState.loading === true
    loadMoreButton.textContent = remoteState.loading ? '加载中…' : '加载更多'
  }

  const renderEntries = (message = '', mode = 'content') => {
    const remoteItems = [...remoteState.items, ...telegramItems]
    const entries = (config.source === 'both' ? [...local, ...remoteItems] : remoteItems).sort(compareMoments)
    root.__momentsEntries = entries
    renderFeed(root, entries, config)
    bindEntryInteractions(root)
    observer = root.__momentsRemoteObserver
    hydrateExtensions(root, config)
    setStatus(root, entries.length ? mode : 'empty', message)
    updateLoadMore()
  }
  const load = async () => {
    observer?.disconnect(); setStatus(root, 'loading'); if (refreshButton) refreshButton.disabled = true
    const remoteCache = remoteEnabled ? readCache(config) : null
    const telegramCache = remoteEnabled ? readTelegramCache(config) : null
    remoteState = remoteCache?.items?.length ? { items: remoteCache.items, total: remoteCache.items.length, page: 1, pageSize: remoteCache.items.length, hasMore: false } : remoteState
    telegramItems = telegramCache?.items || telegramItems
    if (remoteCache?.items?.length || telegramCache?.items?.length) renderEntries('正在后台刷新远程动态…')
    const [remoteResult, telegramResult] = await Promise.allSettled([
      remoteEnabled ? fetchRemoteMoments(config, controller.signal) : Promise.resolve(remoteState),
      remoteEnabled && config.telegram.enabled ? fetchTelegramMoments(config, controller.signal) : Promise.resolve(telegramItems),
    ])
    if (controller.signal.aborted) return
    const failures = []
    if (remoteResult.status === 'fulfilled') remoteState = remoteResult.value
    else { console.warn('[moments-ech0]', remoteResult.reason); failures.push('Ech0') }
    if (telegramResult.status === 'fulfilled') telegramItems = telegramResult.value
    else { console.warn('[moments-telegram]', telegramResult.reason); failures.push('Telegram') }
    const message = failures.length ? `${failures.join('、')} 暂不可用，已显示其它可用动态${(remoteCache?.items?.length || telegramCache?.items?.length) ? '和缓存' : ''}` : ''
    renderEntries(message, failures.length ? 'error' : 'content')
    if (refreshButton) refreshButton.disabled = false
  }
  refreshButton?.addEventListener('click', load, { signal: controller.signal })
  loadMoreButton?.addEventListener('click', async () => {
    if (remoteState.loading || !remoteState.hasMore) return
    remoteState.loading = true; updateLoadMore()
    try {
      const next = await fetchRemotePage(config, remoteState.page + 1, controller.signal)
      const combinedItems = [...remoteState.items, ...next.items].slice(0, config.maxItems)
      remoteState = { items: combinedItems, total: next.total, page: remoteState.page + 1, pageSize: next.pageSize, hasMore: next.hasMore && combinedItems.length < next.total && combinedItems.length < config.maxItems }
      if (config.provider === 'ech0') writeCache(config, remoteState.items)
      renderEntries()
    } catch (error) {
      if (error?.name !== 'AbortError') setStatus(root, 'error', '更多动态加载失败，请稍后重试')
    } finally { remoteState.loading = false; updateLoadMore() }
  }, { signal: controller.signal })
  await load()
  return () => { controller.abort(); observer?.disconnect(); root.__momentsInteractionController?.abort(); root.__momentsRemoteObserver?.disconnect(); root.__momentsExtensionObservers?.forEach((item) => item.disconnect()); root.__momentsExtensionObservers = []; root.__momentsReactionClient = null; root.__momentsConfig = null }
}
