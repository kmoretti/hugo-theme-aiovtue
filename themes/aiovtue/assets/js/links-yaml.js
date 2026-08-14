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
  if (
    (text.startsWith('"') && text.endsWith('"'))
    || (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).replace(/\\([\\"'])/g, '$1')
  }
  return text
}

function readPair(line) {
  const match = line.match(/^\s*([\w-]+):(?:\s*(.*))?$/)
  return match ? { key: match[1], value: parseScalar(match[2] || '') } : null
}

function makeGroup() {
  return { name: '', desc: '', type: '', links: [] }
}

function makeLink() {
  return {
    name: '',
    blog: '',
    url: '',
    avatar: '',
    desc: '',
    color: '#0078e7',
    siteshot: '',
    rss: '',
    friendslink: '',
    tags: [],
  }
}

export function parseLinksYaml(text) {
  const groups = []
  let group = null
  let link = null
  let inLinkList = false
  let inTags = false

  for (const rawLine of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) continue
    const indent = rawLine.match(/^\s*/)[0].length
    const line = rawLine.trim()

    if (indent === 0 && line.startsWith('- ')) {
      const pair = readPair(line.slice(2))
      if (pair?.key === 'class_name') {
        group = makeGroup()
        group.name = pair.value
        groups.push(group)
        link = null
        inLinkList = false
        inTags = false
      }
      continue
    }

    if (!group) continue

    if (indent === 2) {
      const pair = readPair(line)
      if (pair?.key === 'link_list') {
        inLinkList = true
        inTags = false
      } else if (pair?.key === 'class_desc') {
        group.desc = pair.value
        inTags = false
      }
      continue
    }

    if (!inLinkList) continue

    if (indent === 4 && line.startsWith('- ')) {
      const pair = readPair(line.slice(2))
      if (pair?.key === 'name') {
        link = makeLink()
        link.name = pair.value
        group.links.push(link)
        inTags = false
      }
      continue
    }

    if (!link) continue

    if (indent === 6) {
      const pair = readPair(line)
      if (pair?.key === 'tags' && !pair.value) {
        inTags = true
        link.tags = []
      } else if (pair) {
        const fieldMap = {
          link: 'url',
          avatar: 'avatar',
          descr: 'desc',
          feeds: 'rss',
          friendslink: 'friendslink',
          siteshot: 'siteshot',
          color: 'color',
        }
        if (fieldMap[pair.key]) link[fieldMap[pair.key]] = pair.value
        inTags = false
      } else {
        inTags = false
      }
      continue
    }

    if (indent >= 8 && inTags && line.startsWith('- ')) {
      link.tags.push(parseScalar(line.slice(2)))
    }
  }

  return {
    linkGroups: groups
      .map((item) => ({
        ...item,
        links: item.links.map((itemLink) => ({
          ...itemLink,
          blog: itemLink.blog || itemLink.name,
        })),
      }))
      .filter((item) => item.name || item.links.length),
  }
}
