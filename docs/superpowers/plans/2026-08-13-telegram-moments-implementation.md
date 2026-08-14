# Telegram Moments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram posts as an independently cached third moments source that is mixed chronologically with local Hugo and Ech0 entries.

**Architecture:** Keep `remote-moments.js` as the single client-side aggregation boundary. Extend its normalized entry model with a source kind, add Telegram-specific fetch/cache/HTML sanitization helpers, and keep existing feed, image lightbox, and remote behavior intact. Pass Telegram configuration from the Hugo template as data attributes.

**Tech Stack:** Hugo templates and TOML configuration; browser-native JavaScript, DOM APIs, `fetch`, `localStorage`; existing Hugo Pipes build.

---

### Task 1: Expose Telegram Configuration

**Files:**
- Modify: `hugo.toml`
- Modify: `themes/aiovtue/layouts/_default/moments.html`

- [ ] **Step 1: Add explicit Telegram defaults under `params.moments`**

```toml
telegramEnabled = true
telegramURL = "https://tg-channel.081531.xyz/api/posts"
telegramMaxItems = 40
telegramPageSize = 20
telegramCacheMinutes = 30
```

- [ ] **Step 2: Pass the settings through `data-moments-*` attributes**

```go-html-template
data-moments-telegram-enabled="{{ default false $moments.telegramEnabled }}"
data-moments-telegram-url="{{ default "" $moments.telegramURL }}"
data-moments-telegram-max-items="{{ default 40 $moments.telegramMaxItems }}"
data-moments-telegram-page-size="{{ default 20 $moments.telegramPageSize }}"
data-moments-telegram-cache-minutes="{{ default 30 $moments.telegramCacheMinutes }}"
```

- [ ] **Step 3: Build Hugo**

Run: `hugo --renderToMemory --noBuildLock --minify`

Expected: exit code 0.

### Task 2: Normalize And Sanitize Telegram Posts

**Files:**
- Modify: `themes/aiovtue/assets/js/remote-moments.js`

- [ ] **Step 1: Add safe Telegram content sanitization**

Parse API HTML into an inert template. Permit only `div`, `p`, `br`, `b`, `strong`, `i`, `em`, `del`, `s`, `code`, `pre`, `blockquote`, `ul`, `ol`, `li`, and `a`; copy only text nodes, approved element structure, and safe HTTP(S) anchor URLs. Force links to open in a new tab with `rel="noopener noreferrer"`.

- [ ] **Step 2: Add Telegram post normalization**

Map `id`, `datetime`/`timestamp`, `html`/`text`, `tags`, image-only `media`, and `source.telegramUrl` into the current entry contract. Set `source` to `telegram`, disable extensions/comments/reactions, and retain only HTTPS media URLs.

- [ ] **Step 3: Update generic render logic for a Telegram source**

Render sanitized Telegram content, source badge text `Telegram`, tags, and its original-message link. Do not render comments, likes, or extension cards.

- [ ] **Step 4: Syntax-check the module**

Run: `node --check themes/aiovtue/assets/js/remote-moments.js`

Expected: exit code 0.

### Task 3: Fetch, Cache, And Merge Telegram Data

**Files:**
- Modify: `themes/aiovtue/assets/js/remote-moments.js`

- [ ] **Step 1: Parse Telegram settings into client configuration**

Keep Telegram state separate from existing `provider`, `remoteURL`, and Ech0 features.

- [ ] **Step 2: Fetch up to two Telegram pages**

For each page, request `telegramURL?page=<n>&page_size=20`; validate `posts` and `pagination.hasNext`; normalize entries, deduplicate by `telegram:<id>`, then cap to 40 entries.

- [ ] **Step 3: Cache Telegram entries independently**

Use a cache key that includes Telegram URL and maximum item count. Read stale cache before network refresh and write refreshed valid data. Do not change the existing Ech0 cache format.

- [ ] **Step 4: Merge available source results without coupled failures**

Fetch Ech0 and Telegram concurrently. A Telegram error must retain its cached entries when available and never remove local/Ech0 entries. A failed Ech0 request must retain local/Telegram entries. Status text should identify unavailable source(s) without reporting an error when another remote source succeeds.

- [ ] **Step 5: Syntax-check and production-build**

Run: `node --check themes/aiovtue/assets/js/remote-moments.js; hugo --renderToMemory --noBuildLock --minify; git diff --check`

Expected: all commands exit code 0.

### Task 4: Verify Browser Behavior On Port 1313

**Files:**
- No source changes expected.

- [ ] **Step 1: Stop the existing port-1313 preview process**

Run: `Get-NetTCPConnection -LocalPort 1313 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }`

Expected: no process remains bound to port 1313.

- [ ] **Step 2: Start the Hugo server on the required port**

Run: `hugo server --port 1313 --bind 127.0.0.1 --disableFastRender`

Expected: the server reports a `http://localhost:1313/` URL.

- [ ] **Step 3: Check mixed feed in Chrome**

Open `/moments/`; confirm Telegram badges appear, Telegram posts are interleaved by descending timestamp, and “查看原消息” points to the Telegram source URL.

- [ ] **Step 4: Check Telegram image lightbox**

Open a Telegram image; confirm the existing lightbox opens the actual image and can be dismissed.

- [ ] **Step 5: Report verification evidence**

Include build result, browser checks, and any residual limitation in the final handoff.
