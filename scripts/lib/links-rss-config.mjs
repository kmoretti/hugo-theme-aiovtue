import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function getLinksDataSource(root = join(import.meta.dirname, '../..')) {
  try {
    const out = execSync('hugo config --format json', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const cfg = JSON.parse(out)
    const links = cfg.params?.links || {}
    const source = String(links.source || 'local').trim().toLowerCase()

    if (source !== 'remote') {
      return { type: 'local', url: '' }
    }

    const url = String(links.remoteurl || '').trim()
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('params.links.remoteURL 必须是 http(s) 绝对地址')
    }
    return { type: 'remote', url }
  } catch (err) {
    if (err?.message?.includes('params.links.remoteURL')) throw err
    return { type: 'local', url: '' }
  }
}

export function isLinksRssEnabled(root = join(import.meta.dirname, '../..')) {
  try {
    const out = execSync('hugo config --format json', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const cfg = JSON.parse(out)
    return cfg.params?.links?.rssenable === true
  } catch {
    return false
  }
}

export function writeEmptyLinksRss(outputPath) {
  writeFileSync(
    outputPath,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), feeds: [] }, null, 2)}\n`,
    'utf8',
  )
}
