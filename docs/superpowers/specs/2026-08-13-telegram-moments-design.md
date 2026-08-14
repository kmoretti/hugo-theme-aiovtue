# Telegram Moments Design

## Goal

Add Telegram as a third moments source alongside local Hugo content and Ech0. All enabled sources are combined into one descending chronological feed.

## Configuration

`params.moments` will retain the existing local/Ech0 settings and add Telegram-specific settings: enabled state, API URL, maximum initial items, page size, cache lifetime, and source badge visibility. The default maximum is 40 items, fetched from two 20-item pages.

## Data Flow

The existing remote moments client will independently fetch Ech0 and Telegram. Each source normalizes its payload into the established entry model before entries are combined, stably sorted by date, and batch-rendered by the existing list flow.

Telegram field mapping:

- `id` becomes a Telegram-prefixed stable source ID.
- `datetime` is the primary date; `timestamp` is a fallback.
- `html` is sanitized before rendering; `text` is the fallback content.
- `tags` maps to tags.
- Image-only `media` items map to moment media.
- `source.telegramUrl` maps to the original message link.

Telegram entries do not render attachments, extension cards, comments, reactions, or likes.

## Rendering And Security

Telegram entries use the existing Ech0-style moment card. They show content, images, timestamp, tags, a Telegram source badge, and an original-message link. Images use the existing `data-media-src` conventions and native lightbox.

Remote HTML is never inserted as trusted markup. Its allowed elements and attributes are sanitized before DOM insertion, and unsafe URLs, event attributes, scripts, embeds, and styles are removed.

## Resilience

Each remote source has its own stale-while-revalidate local cache. A Telegram failure does not prevent local or Ech0 entries from rendering. Cached Telegram data remains eligible for display when fresh retrieval fails.

## Verification

Run Hugo production build and preview with `hugo server --port 1313`, stopping any existing 1313 process first. Verify Telegram entries are chronologically interleaved, badges and original-message links are correct, image lightbox works, and an unavailable Telegram source degrades without blocking the rest of the feed.
