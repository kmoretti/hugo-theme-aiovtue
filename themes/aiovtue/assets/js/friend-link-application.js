const PAGE_SIZE = 12
const STATUS_NAMES = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
}

function qs(selector, root = document) {
  return root.querySelector(selector)
}

function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)]
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

function getErrorMessage(payload, fallback) {
  return String(payload?.message || payload?.error || fallback || '请求失败，请稍后重试。')
}

export function initFriendLinkApplication() {
  const root = document.getElementById('friend-link-application')
  if (!root || root.dataset.initialized === '1') return
  root.dataset.initialized = '1'

  const apiBase = (root.dataset.apiBase || '').replace(/\/+$/, '')
  const formWrap = qs('#friend-link-form-wrap', root)
  const conditionChecks = qsa('.friend-link-condition__check', root)
  const conditionHint = qs('.friend-link-conditions__hint', root)
  const conditionError = qs('#friend-link-conditions-error', root)
  const form = qs('#friend-link-form', root)
  const formError = qs('#friend-link-form-error', root)
  const success = qs('#friend-link-success', root)
  const successMessage = qs('#friend-link-success-message', root)
  const submitButton = qs('#friend-link-submit', root)
  const continueButton = qs('#friend-link-continue', root)
  const modeHint = qs('#friend-link-mode-hint', root)
  const modeButtons = qsa('[data-friend-mode]', root)
  const updateFields = qsa('[data-update-only]', root)
  const modeRequiredFields = qsa('#friend-name, #friend-link, #friend-avatar, #friend-page', root)
  const modeRequiredMarkers = qsa('.friend-link-required-marker', root)
  const originalUrl = qs('#friend-original-url', root)
  const rssInput = qs('#friend-feed', root)
  const statusList = qs('#friend-link-status-list', root)
  const statusError = qs('#friend-link-status-error', root)
  const statusCount = qs('#friend-link-status-count', root)
  const statusFilter = qs('#friend-link-status-filter', root)
  const statusSearch = qs('#friend-link-status-search', root)
  const pagination = qs('#friend-link-status-pagination', root)
  const pagePrev = qs('#friend-link-page-prev', root)
  const pageNext = qs('#friend-link-page-next', root)
  const pageInfo = qs('#friend-link-page-info', root)

  let mode = 'apply'
  let statusPage = 1
  let totalPages = 1
  let searchTimer = null

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    })
    let payload = {}
    try { payload = await response.json() } catch (_) {}
    if (!response.ok || (payload.code && Number(payload.code) >= 400)) {
      throw new Error(getErrorMessage(payload, `请求失败（HTTP ${response.status}）`))
    }
    return payload
  }

  function showFormError(message = '') {
    formError.textContent = message
    formError.hidden = !message
  }

  function allConditionsChecked() {
    return conditionChecks.length > 0 && conditionChecks.every((check) => check.checked)
  }

  function updateConditionUI() {
    const checked = allConditionsChecked()
    conditionError.hidden = true
    if (conditionHint) conditionHint.hidden = checked
    formWrap.hidden = !checked
    if (!checked) {
      form.hidden = true
      modeButtons.forEach((button) => button.classList.remove('is-active'))
    }
  }

  function updateModeUI(nextMode) {
    mode = nextMode
    form.hidden = false
    modeButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.friendMode === mode))
    updateFields.forEach((field) => { field.hidden = mode !== 'update' })
    modeRequiredFields.forEach((field) => { field.required = mode === 'apply' })
    modeRequiredMarkers.forEach((marker) => { marker.hidden = mode !== 'apply' })
    if (originalUrl) originalUrl.required = mode === 'update'
    modeHint.textContent = mode === 'update'
      ? '填写原站点地址；新的信息只填写需要更新的字段，提交后等待管理员审核。'
      : '填写资料后提交申请，审核通过后会显示在友链列表中。'
    submitButton.textContent = mode === 'update' ? '提交更新' : '提交申请'
    if (mode === 'apply' && originalUrl) originalUrl.value = ''
    showFormError('')
  }

  function collectFormData() {
    const values = Object.fromEntries(new FormData(form).entries())
    const data = {
      type: mode,
      name: String(values.name || '').trim(),
      url: String(values.link || '').trim(),
      avatar: String(values.avatar || '').trim(),
      friendslink: String(values.friend_link_page || '').trim(),
      description: String(values.description || '').trim(),
      siteshot: String(values.snapshot || '').trim(),
      feeds: String(values.feed || '').trim(),
      email: String(values.email || '').trim(),
      originalUrl: mode === 'update' ? String(values.original_url || '').trim() : '',
    }
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== ''))
  }

  function validateForm() {
    if (!form.reportValidity()) return false
    if (mode === 'update' && !originalUrl.value.trim()) {
      showFormError('请填写原站点地址。')
      return false
    }
    showFormError('')
    return true
  }

  async function submitForm(event) {
    event.preventDefault()
    if (!validateForm()) return
    submitButton.disabled = true
    submitButton.textContent = '提交中…'
    try {
      const payload = await apiFetch('/api/submissions', { method: 'POST', body: JSON.stringify(collectFormData()) })
      formWrap.hidden = true
      success.hidden = false
      successMessage.textContent = getErrorMessage(payload, '友链申请已提交，等待管理员审核。')
      success.scrollIntoView({ behavior: 'smooth', block: 'center' })
      await loadSubmissions()
    } catch (error) {
      showFormError(error.message)
    } finally {
      submitButton.disabled = false
      submitButton.textContent = mode === 'update' ? '提交更新' : '提交申请'
    }
  }

  function renderSubmission(item) {
    const status = String(item.status || 'pending')
    const label = STATUS_NAMES[status] || status
    const typeLabel = item.type === 'update' ? '更新' : '新增'
    return `<article class="friend-link-status__item">
      <div>
        <h4>${escapeHtml(item.name || '未命名站点')}</h4>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
        <p class="friend-link-status__type">类型：${typeLabel}</p>
      </div>
      <span class="friend-link-status__badge friend-link-status__badge--${escapeHtml(status)}">${escapeHtml(label)}</span>
    </article>`
  }

  async function loadSubmissions() {
    statusError.hidden = true
    statusList.innerHTML = '<p class="friend-link-status__hint">正在加载申请记录…</p>'
    const params = new URLSearchParams({ public: '1' })
    if (statusFilter.value) params.set('status', statusFilter.value)
    if (statusSearch.value.trim()) params.set('search', statusSearch.value.trim())
    try {
      const payload = await apiFetch(`/api/submissions?${params}`)
      const allItems = Array.isArray(payload.submissions) ? payload.submissions : []
      const total = allItems.length
      totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
      if (statusPage > totalPages) statusPage = totalPages
      const start = (statusPage - 1) * PAGE_SIZE
      const items = allItems.slice(start, start + PAGE_SIZE)
      statusCount.textContent = `（共 ${total} 条）`
      statusList.innerHTML = items.length
        ? items.map(renderSubmission).join('')
        : '<p class="friend-link-status__hint">暂无申请记录</p>'
      pagination.hidden = totalPages <= 1
      pageInfo.textContent = `${statusPage} / ${totalPages}`
      pagePrev.disabled = statusPage <= 1
      pageNext.disabled = statusPage >= totalPages
    } catch (error) {
      statusList.innerHTML = ''
      statusError.innerHTML = `<span>${escapeHtml(error.message)}</span><button type="button" class="friend-link-retry" id="friend-link-status-retry">重新加载</button>`
      statusError.hidden = false
      qs('#friend-link-status-retry', statusError)?.addEventListener('click', loadSubmissions, { once: true })
    }
  }

  conditionChecks.forEach((check) => check.addEventListener('change', updateConditionUI))
  modeButtons.forEach((button) => button.addEventListener('click', () => updateModeUI(button.dataset.friendMode)))
  form?.addEventListener('submit', submitForm)
  continueButton?.addEventListener('click', () => {
    success.hidden = true
    formWrap.hidden = false
    form.reset()
    form.hidden = true
    mode = 'apply'
    modeButtons.forEach((button) => button.classList.remove('is-active'))
    updateFields.forEach((field) => { field.hidden = true })
    modeRequiredFields.forEach((field) => { field.required = false })
    modeRequiredMarkers.forEach((marker) => { marker.hidden = true })
    if (originalUrl) originalUrl.required = false
    modeHint.textContent = '请选择申请友链或更新友链/信息。'
    showFormError('')
    formWrap.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  statusFilter?.addEventListener('change', () => { statusPage = 1; void loadSubmissions() })
  statusSearch?.addEventListener('input', () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => { statusPage = 1; void loadSubmissions() }, 300)
  })
  pagePrev?.addEventListener('click', () => { if (statusPage > 1) { statusPage -= 1; void loadSubmissions() } })
  pageNext?.addEventListener('click', () => { if (statusPage < totalPages) { statusPage += 1; void loadSubmissions() } })

  updateConditionUI()
  void loadSubmissions()
}
