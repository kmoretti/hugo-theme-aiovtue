import { escapeHtml, shuffleArray } from './utils.js'
import { initLazyImages } from './lazy-images.js'
import { parseLinksYaml } from './links-yaml.js'

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 500

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

function safeColor(value) {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#0078e7'
}

function safeMediaUrl(value, fallback = '') {
  return isHttpUrl(value) ? String(value).trim() : fallback
}

function normalizeTags(value) {
  const values = Array.isArray(value) ? value : [value]
  return [...new Set(values
    .map((tag) => String(tag || '').trim())
    .filter(Boolean))]
}

function renderTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return ''
  const visible = tags.slice(0, 3)
  const remaining = tags.length - visible.length
  return `<div class="links-preview-tags" aria-label="友链标签">
    ${visible.map((tag) => `<span class="links-preview-tag">${escapeHtml(tag)}</span>`).join('')}
    ${remaining > 0 ? `<span class="links-preview-tag links-preview-tag--more">+${remaining}</span>` : ''}
  </div>`
}

function normalizeGroups(payload) {
  const groups = Array.isArray(payload?.linkGroups) ? payload.linkGroups : null
  if (!groups) throw new Error('远程数据缺少 linkGroups')

  return groups.map((group) => ({
    name: String(group?.name || '').trim(),
    desc: String(group?.desc || '').trim(),
    type: String(group?.type || '').trim(),
    links: Array.isArray(group?.links)
      ? group.links.map((link) => ({
        name: String(link?.name || '').trim(),
        blog: String(link?.blog || '').trim(),
        url: String(link?.url || '').trim(),
        avatar: String(link?.avatar || '').trim(),
        desc: String(link?.desc || '').trim(),
        color: safeColor(link?.color),
        siteshot: safeMediaUrl(link?.siteshot),
        tags: normalizeTags(link?.tags),
      })).filter((link) => link.name && isHttpUrl(link.url))
      : [],
  })).filter((group) => group.name || group.links.length)
}

function resolveCover(link, defaultCover) {
  return link.siteshot || `https://s0.wp.com/mshots/v1/${encodeURIComponent(link.url)}?w=800&h=450` || defaultCover
}

function renderGroup(group, pageLayout, defaultCover) {
  const groupLayout = ['preview', 'simple'].includes(group.type)
    ? group.type
    : pageLayout
  const cards = group.links.map((link) => {
    const siteshot = safeMediaUrl(resolveCover(link, defaultCover), defaultCover)
    const color = escapeHtml(safeColor(link.color))
    const url = escapeHtml(link.url)
    const avatar = escapeHtml(safeMediaUrl(link.avatar, defaultCover))
    const name = escapeHtml(link.name)
    const blog = escapeHtml(link.blog || link.name)
    const desc = escapeHtml(link.desc)

    if (groupLayout === 'simple') {
      return `<li class="links-preview-item" style="--link-color: ${color}">
        <a class="links-preview-card links-preview-card--simple" href="${url}" target="_blank" rel="friend noopener">
          <img class="sakura-lazy-img links-preview-avatar" src="${avatar}" alt="${name}" loading="lazy" decoding="async">
          <div class="links-preview-text">
            <div class="links-preview-name">${blog}</div>
            <div class="links-preview-desc">${desc}</div>
          </div>
          <div class="links-preview-hover-shot" aria-hidden="true">
            <img class="sakura-lazy-img" src="${escapeHtml(siteshot)}" alt="" loading="lazy" decoding="async">
          </div>
          ${renderTags(link.tags)}
        </a>
      </li>`
    }

    return `<li class="links-preview-item" style="--link-color: ${color}">
      <a class="links-preview-card" href="${url}" target="_blank" rel="friend noopener">
        <div class="links-preview-shot">
          <img class="sakura-lazy-img" src="${escapeHtml(siteshot)}" alt="${name}" loading="lazy" decoding="async">
        </div>
        <div class="links-preview-meta">
          <img class="sakura-lazy-img links-preview-avatar" src="${avatar}" alt="${name}" loading="lazy" decoding="async">
          <div class="links-preview-text">
            <div class="links-preview-name">${blog}</div>
            <div class="links-preview-desc">${desc}</div>
          </div>
        </div>
        ${renderTags(link.tags)}
      </a>
    </li>`
  }).join('')

  return `<section class="links-preview-group links-preview-group--${escapeHtml(groupLayout)}">
    <header class="links-preview-group__header">
      <h2 class="links-preview-group__title">
        <span class="links-preview-group__title-icon" aria-hidden="true">📌</span>
        <span class="links-preview-group__title-text">${escapeHtml(group.name)}</span>
      </h2>
      ${group.desc ? `<p class="links-preview-group__desc">分类描述 🌸：${escapeHtml(group.desc)}</p>` : ''}
    </header>
    ${cards ? `<ul class="links-preview-grid">${cards}</ul>` : '<p class="links-preview-remote__empty">这个分组暂时没有友链。</p>'}
  </section>`
}

function renderGroups(groups, pageLayout, defaultCover) {
  if (!groups.length) {
    return '<p class="links-preview-remote__empty">远程数据中暂时没有友链。</p>'
  }
  return groups.map((group) => renderGroup(group, pageLayout, defaultCover)).join('')
}

function renderRemoteFooterLinks(groups) {
  const target = document.getElementById('sakura-footer-links')
  if (!target) return

  const links = groups.flatMap((group) => group.links)
  if (!links.length) {
    target.hidden = true
    return
  }

  target.innerHTML = `<ul class="sakura-footer-links__list">${links.slice(0, 12).map((link) =>
    `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="friend noopener">${escapeHtml(link.blog || link.name)}</a></li>`,
  ).join('')}</ul>`
  target.hidden = false
}

function shuffleRemoteGroups(root) {
  root.querySelectorAll('.links-preview-group .links-preview-grid').forEach((grid) => {
    shuffleArray([...grid.children]).forEach((item) => grid.appendChild(item))
  })
}

async function fetchGroups(url) {
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('远程友链地址无效')

  let lastError
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`)
      const text = await response.text()
      const payload = /^\s*[\[{]/.test(text)
        ? JSON.parse(text)
        : parseLinksYaml(text)
      return normalizeGroups(payload)
    } catch (err) {
      lastError = err.name === 'AbortError' ? new Error('远程友链请求超时') : err
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * (attempt + 1))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError || new Error('远程友链请求失败')
}

function setRemoteState(root, state) {
  root.querySelectorAll('[data-remote-status]').forEach((el) => {
    el.hidden = el.dataset.remoteStatus !== state
  })
}

export function initRemoteLinks() {
  const root = document.getElementById('links-preview-remote')
  if (!root || root.dataset.initialized === 'true') return
  root.dataset.initialized = 'true'

  const content = root.querySelector('[data-remote-status="content"]')
  const retry = root.querySelector('.links-preview-remote__retry')
  const url = root.dataset.remoteUrl || ''
  const pageLayout = ['preview', 'simple'].includes(root.dataset.layout)
    ? root.dataset.layout
    : 'preview'
  const defaultCover = root.dataset.defaultCover || '/hero/tt3.png'

  const load = async () => {
    setRemoteState(root, 'loading')
    try {
      const groups = await fetchGroups(url)
      content.innerHTML = renderGroups(groups, pageLayout, defaultCover)
      renderRemoteFooterLinks(groups)
      setRemoteState(root, 'content')
      shuffleRemoteGroups(root)
      initLazyImages(root)
    } catch (err) {
      console.warn('[remote-links]', err)
      setRemoteState(root, 'error')
    }
  }

  retry?.addEventListener('click', load)
  void load()
}
