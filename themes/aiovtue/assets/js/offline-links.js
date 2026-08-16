import { escapeHtml } from './utils.js'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500
const REQUEST_TIMEOUT_MS = 15000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function stripInlineComment(value) {
  let quote = ''
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if ((char === '"' || char === "'") && value[index - 1] !== '\\') {
      quote = quote === char ? '' : (quote || char)
    }
    if (char === '#' && !quote && index > 0 && /\s/.test(value[index - 1])) {
      return value.slice(0, index).trim()
    }
  }
  return value.trim()
}

function parseScalar(value) {
  const text = stripInlineComment(String(value || '').trim())
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).replace(/\\([\\"'])/g, '$1')
  }
  return text
}

function parseOfflineLinksYaml(text) {
  const links = []
  let entry = null

  for (const rawLine of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) continue
    const indent = rawLine.match(/^\s*/)[0].length
    const line = rawLine.trim()

    if (indent === 0 && line === '- entry:') {
      entry = { name: '', avatar: '' }
      links.push(entry)
      continue
    }

    if (!entry || indent !== 4) continue
    const pair = line.match(/^([\w-]+):(?:\s*(.*))?$/)
    if (!pair) continue

    if (pair[1] === 'name' || pair[1] === 'avatar') {
      entry[pair[1]] = parseScalar(pair[2] || '')
    }
  }

  return links.filter((link) => link.name)
}

function createFreshUrl(value) {
  const url = new URL(value)
  url.searchParams.set('_', String(Date.now()))
  return url.href
}

async function fetchOfflineLinks(url) {
  if (!isHttpUrl(url)) throw new Error('失联友链地址无效')

  let lastError
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(createFreshUrl(url), {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`)
      return parseOfflineLinksYaml(await response.text())
    } catch (error) {
      lastError = error.name === 'AbortError' ? new Error('失联友链请求超时') : error
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * (attempt + 1))
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError || new Error('失联友链请求失败')
}

function renderLinks(links) {
  if (!links.length) return '<p class="offline-links__empty">暂时没有失联友链记录。</p>'

  return `<ul class="offline-links__list">${links.map((link) => {
    const avatar = isHttpUrl(link.avatar)
      ? `<img class="offline-links__avatar" src="${escapeHtml(link.avatar)}" alt="" loading="lazy" decoding="async">`
      : ''
    return `<li class="offline-links__item">${avatar}<span class="offline-links__name">${escapeHtml(link.name)}</span></li>`
  }).join('')}</ul>`
}

function setState(root, state) {
  root.querySelectorAll('[data-offline-status]').forEach((element) => {
    element.hidden = element.dataset.offlineStatus !== state
  })
}

function bindAvatarFallbacks(root) {
  root.querySelectorAll('.offline-links__avatar').forEach((avatar) => {
    avatar.addEventListener('error', () => avatar.remove(), { once: true })
  })
}

export function initOfflineLinks() {
  const root = document.getElementById('offline-links')
  if (!root || root.dataset.initialized === 'true') return
  root.dataset.initialized = 'true'

  const content = root.querySelector('[data-offline-status="content"]')
  const retry = root.querySelector('.offline-links__retry')
  const url = root.dataset.offlineUrl || ''

  const load = async () => {
    root.hidden = false
    setState(root, 'loading')
    try {
      content.innerHTML = renderLinks(await fetchOfflineLinks(url))
      bindAvatarFallbacks(content)
      setState(root, 'content')
    } catch (error) {
      console.warn('[offline-links]', error)
      setState(root, 'error')
    }
  }

  retry?.addEventListener('click', load)
  void load()
}
