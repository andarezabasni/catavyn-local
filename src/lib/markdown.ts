// Lightweight HTML <-> Markdown conversion for note export/import.
// Covers exactly the node set the Tiptap editor produces (headings, bold,
// italic, strike, inline code, lists, task lists, blockquote, code block, hr)
// so no external converter dependency is needed.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------------------
// HTML -> Markdown (export)
// ---------------------------------------------------------------------------

function inlineToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof Element)) return ''
  const inner = Array.from(node.childNodes).map(inlineToMd).join('')
  switch (node.tagName) {
    case 'STRONG':
    case 'B':
      return inner ? `**${inner}**` : ''
    case 'EM':
    case 'I':
      return inner ? `*${inner}*` : ''
    case 'S':
    case 'DEL':
      return inner ? `~~${inner}~~` : ''
    case 'CODE':
      return inner ? `\`${inner}\`` : ''
    case 'A':
      return `[${inner}](${node.getAttribute('href') ?? ''})`
    case 'BR':
      return '\n'
    default:
      return inner
  }
}

function childrenToMd(el: Element): string {
  return Array.from(el.childNodes).map(inlineToMd).join('').trim()
}

function listToMd(el: Element, ordered: boolean, indent: string): string {
  const isTaskList = el.getAttribute('data-type') === 'taskList'
  const lines: string[] = []
  let index = 1
  for (const li of Array.from(el.children)) {
    if (li.tagName !== 'LI') continue
    const marker = isTaskList
      ? li.getAttribute('data-checked') === 'true' ? '- [x] ' : '- [ ] '
      : ordered ? `${index++}. ` : '- '

    let text = ''
    const nested: string[] = []
    for (const child of Array.from(li.childNodes)) {
      if (child instanceof Element && (child.tagName === 'UL' || child.tagName === 'OL')) {
        nested.push(listToMd(child, child.tagName === 'OL', indent + '  '))
      } else if (child instanceof Element && child.tagName === 'LABEL') {
        // Task item checkbox markup — the state lives in data-checked
      } else {
        text += inlineToMd(child)
      }
    }
    lines.push(indent + marker + text.trim())
    if (nested.length) lines.push(...nested)
  }
  return lines.join('\n')
}

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks: string[] = []
  for (const el of Array.from(doc.body.children)) {
    switch (el.tagName) {
      case 'H1': blocks.push(`# ${childrenToMd(el)}`); break
      case 'H2': blocks.push(`## ${childrenToMd(el)}`); break
      case 'H3': blocks.push(`### ${childrenToMd(el)}`); break
      case 'UL': blocks.push(listToMd(el, false, '')); break
      case 'OL': blocks.push(listToMd(el, true, '')); break
      case 'BLOCKQUOTE': {
        const inner = htmlToMarkdown(el.innerHTML)
        blocks.push(inner.split('\n').map(l => `> ${l}`).join('\n'))
        break
      }
      case 'PRE':
        blocks.push('```\n' + (el.textContent ?? '').replace(/\n$/, '') + '\n```')
        break
      case 'HR': blocks.push('---'); break
      default: {
        const text = childrenToMd(el)
        if (text) blocks.push(text)
      }
    }
  }
  return blocks.filter(b => b !== '').join('\n\n')
}

// ---------------------------------------------------------------------------
// Markdown -> HTML (import) — produces the same HTML shapes Tiptap parses
// ---------------------------------------------------------------------------

function inlineToHtml(s: string): string {
  let t = escapeHtml(s)
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  t = t.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  return t
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const html: string[] = []

  type ListType = 'ul' | 'ol' | 'task'
  let listType: ListType | null = null
  let listItems: string[] = []
  let inCode = false
  let codeLines: string[] = []

  function flushList() {
    if (!listType) return
    if (listType === 'task') {
      html.push(`<ul data-type="taskList">${listItems.join('')}</ul>`)
    } else {
      html.push(`<${listType}>${listItems.join('')}</${listType}>`)
    }
    listType = null
    listItems = []
  }

  function pushItem(type: ListType, item: string) {
    if (listType !== type) {
      flushList()
      listType = type
    }
    listItems.push(item)
  }

  for (const line of lines) {
    if (inCode) {
      if (/^```/.test(line)) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        inCode = false
        codeLines = []
      } else {
        codeLines.push(line)
      }
      continue
    }
    if (/^```/.test(line)) {
      flushList()
      inCode = true
      continue
    }

    let m: RegExpMatchArray | null

    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushList()
      // The editor only supports heading levels 1-2; deeper levels map to h2
      const tag = m[1].length === 1 ? 'h1' : 'h2'
      html.push(`<${tag}>${inlineToHtml(m[2])}</${tag}>`)
      continue
    }
    if ((m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/))) {
      const checked = m[1].toLowerCase() === 'x'
      pushItem('task', `<li data-type="taskItem" data-checked="${checked}"><p>${inlineToHtml(m[2])}</p></li>`)
      continue
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      pushItem('ul', `<li><p>${inlineToHtml(m[1])}</p></li>`)
      continue
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      pushItem('ol', `<li><p>${inlineToHtml(m[1])}</p></li>`)
      continue
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushList()
      html.push('<hr>')
      continue
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      flushList()
      html.push(`<blockquote><p>${inlineToHtml(m[1])}</p></blockquote>`)
      continue
    }
    if (line.trim() === '') {
      flushList()
      continue
    }
    flushList()
    html.push(`<p>${inlineToHtml(line)}</p>`)
  }

  if (inCode) html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  flushList()

  return html.join('')
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function safeFilename(title: string): string {
  return (title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Untitled').slice(0, 100)
}

export function exportNoteAsMarkdown(title: string, contentHtml: string) {
  const md = `# ${title}\n\n${htmlToMarkdown(contentHtml)}\n`
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFilename(title)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export function exportNoteAsPdf(title: string, contentHtml: string) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #2C2C2C; max-width: 42rem; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.65; }
  h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  h1.note-title { border-bottom: 2px solid #C4A84D; padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
  h2 { font-size: 1.3rem; }
  blockquote { border-left: 3px solid #C4A84D; margin-left: 0; padding-left: 1rem; color: #6B6560; }
  pre { background: #F5F0E8; border: 1px solid #D0C8B8; border-radius: 6px; padding: 0.75rem 1rem; overflow-x: auto; font-size: 0.85rem; }
  code { font-family: 'JetBrains Mono', Consolas, monospace; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0.25rem; }
  ul[data-type="taskList"] li { display: flex; gap: 0.5rem; align-items: baseline; }
  ul[data-type="taskList"] li p { margin: 0.2rem 0; }
  hr { border: none; border-top: 1px solid #D0C8B8; margin: 1.5rem 0; }
  @media print { body { margin: 0 auto; } }
</style>
</head>
<body>
<h1 class="note-title">${escapeHtml(title)}</h1>
${contentHtml}
</body>
</html>`)
  win.document.close()
  win.focus()
  // Give the new window a moment to render before opening the print dialog
  setTimeout(() => win.print(), 300)
}

const MAX_IMPORT_SIZE = 1024 * 1024 // 1 MB per file is far beyond any real note

export interface ImportedNote {
  title: string
  content: string
}

export function parseMarkdownFile(text: string, filename: string): ImportedNote {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let title = filename.replace(/\.(md|markdown|txt)$/i, '')
  let body = text

  // If the file starts with a single H1, promote it to the note title
  const firstContent = lines.findIndex(l => l.trim() !== '')
  if (firstContent !== -1) {
    const m = lines[firstContent].match(/^#\s+(.+)$/)
    if (m) {
      title = m[1].trim()
      body = lines.slice(firstContent + 1).join('\n')
    }
  }

  return { title: title.slice(0, 200) || 'Untitled', content: markdownToHtml(body) }
}

export function isImportableFile(file: File): boolean {
  return /\.(md|markdown|txt)$/i.test(file.name) && file.size <= MAX_IMPORT_SIZE
}
