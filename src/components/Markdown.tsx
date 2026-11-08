import type { ReactNode } from 'react'

// Markdown das notas do cérebro, montado como elementos React (nunca HTML injetado: as notas são
// conteúdo de fora). Cobre o que aparece num vault: títulos, listas, tarefas, citação, código, tabela,
// negrito, itálico, destaque, [[links]] (abrem a nota) e [texto](url) (só mostra, não navega).

type Props = { source: string; onLink?: (target: string) => void; hideTitle?: string }

const stripFrontmatter = (s: string) => s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')

function inline(text: string, onLink: Props['onLink'], key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  // ordem importa: código primeiro (nada dentro dele é interpretado)
  const re = /(`[^`]+`)|(\[\[[^\]]+\]\])|(\*\*[^*]+\*\*|__[^_]+__)|(==[^=]+==)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const k = `${key}-${n++}`
    if (m[1]) out.push(<code key={k} className="rounded bg-raised px-1 py-0.5 font-mono text-[0.88em]">{t.slice(1, -1)}</code>)
    else if (m[2]) {
      const inner = t.slice(2, -2)
      const [target, alias] = inner.split('|')
      const label = (alias ?? target.split('#')[0].split('/').pop() ?? target).trim()
      out.push(onLink
        ? <button key={k} type="button" onClick={() => onLink(target.split('#')[0].trim())} className="text-link underline decoration-line-strong underline-offset-2 hover:decoration-current">{label}</button>
        : <span key={k} className="text-link">{label}</span>)
    } else if (m[3]) out.push(<strong key={k} className="font-semibold">{inline(t.slice(2, -2), onLink, k)}</strong>)
    else if (m[4]) out.push(<mark key={k} className="rounded bg-accent-soft px-0.5 text-fg">{t.slice(2, -2)}</mark>)
    else if (m[5]) out.push(<em key={k} className="italic">{inline(t.slice(1, -1), onLink, k)}</em>)
    else if (m[6]) {
      const mm = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!
      out.push(<span key={k} className="text-link" title={mm[2]}>{mm[1]}</span>)
    }
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const isTable = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const isSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export function Markdown({ source, onLink, hideTitle }: Props) {
  const lines = stripFrontmatter(source).replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let b = 0
  const H = ['text-[24px]', 'text-[20px]', 'text-[17px]', 'text-[15.5px]', 'text-[15px]', 'text-[14.5px]']

  while (i < lines.length) {
    const line = lines[i]
    const key = `b${b++}`

    if (!line.trim()) { i++; continue }

    if (/^\s*```/.test(line)) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++])
      i++
      blocks.push(<pre key={key} className="overflow-x-auto rounded-lg bg-raised p-3 font-mono text-[12.5px] leading-relaxed">{body.join('\n')}</pre>)
      continue
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      i++
      if (h[1].length === 1 && hideTitle && h[2].trim() === hideTitle.trim()) continue
      const Tag = `h${Math.min(h[1].length + 1, 6)}` as 'h2'
      blocks.push(<Tag key={key} className={`${H[h[1].length - 1]} mt-2 font-serif leading-snug first:mt-0`}>{inline(h[2], onLink, key)}</Tag>)
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push(<hr key={key} className="border-line" />); i++; continue }

    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push(<blockquote key={key} className="border-l-2 border-accent pl-3 text-muted">{inline(body.join(' '), onLink, key)}</blockquote>)
      continue
    }

    if (isTable(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isTable(lines[i])) rows.push(cells(lines[i++]))
      blocks.push(
        <div key={key} className="overflow-x-auto"><table className="w-full border-collapse text-[13.5px]">
          <thead><tr>{head.map((c, k) => <th key={k} className="border-b border-line-strong px-2 py-1.5 text-left font-medium">{inline(c, onLink, `${key}h${k}`)}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, k) => <td key={k} className="border-b border-line px-2 py-1.5 align-top">{inline(c, onLink, `${key}r${ri}c${k}`)}</td>)}</tr>)}</tbody>
        </table></div>,
      )
      continue
    }

    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
    if (li.test(line)) {
      const ordered = /^\s*\d/.test(line)
      const items: { indent: number; text: string }[] = []
      while (i < lines.length && li.test(lines[i])) {
        const mm = lines[i].match(li)!
        items.push({ indent: Math.floor(mm[1].replace(/\t/g, '  ').length / 2), text: mm[3] })
        i++
      }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag key={key} className={`flex flex-col gap-1 ${ordered ? 'list-decimal' : 'list-disc'} pl-5 marker:text-accent`}>
          {items.map((it, k) => {
            const task = it.text.match(/^\[( |x|X)\]\s*(.*)$/)
            const content = task ? task[2] : it.text
            return (
              <li key={k} style={{ marginLeft: it.indent * 16 }} className={task ? 'list-none -ml-5 flex gap-2' : ''}>
                {task && <span aria-hidden="true" className={`mt-1 grid size-4 shrink-0 place-items-center rounded border text-[10px] ${task[1] === ' ' ? 'border-line-strong' : 'border-accent bg-accent text-on-accent'}`}>{task[1] === ' ' ? '' : '✓'}</span>}
                <span className={task && task[1] !== ' ' ? 'text-muted line-through' : ''}>{content.trim() ? inline(content, onLink, `${key}-${k}`) : <span className="text-faint">vazio</span>}</span>
              </li>
            )
          })}
        </Tag>,
      )
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i]) && !(isTable(lines[i]) && isSep(lines[i + 1] ?? ''))) para.push(lines[i++])
    if (para.length === 0) { i++; continue }
    blocks.push(<p key={key}>{inline(para.join(' '), onLink, key)}</p>)
  }

  return <div className="flex flex-col gap-3 text-[14.5px] leading-relaxed">{blocks}</div>
}

/** Texto corrido de um trecho de Markdown, para resultados de busca (mantém os marcadores \u0002/\u0003). */
export function plainText(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_, t: string) => t.split('#')[0].split('/').pop() ?? t)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s*)?/gm, '')
    .replace(/(\*\*|__|==|`)/g, '')
    .replace(/(^|\s)[*_]([^*_\s][^*_]*)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
