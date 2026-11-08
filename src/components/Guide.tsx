import { useEffect, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { Button } from './ui'
import type { Guide } from '../data/methods'

// Tutoriais: como usar (passos), por que é assim, quando usar e a origem.
export function GuideBlock({ guide, compact }: { guide: Guide; compact?: boolean }) {
  const h = 'text-[12px] font-semibold text-muted'
  return (
    <div className={`flex flex-col ${compact ? 'gap-3' : 'gap-4'} text-[13.5px] leading-relaxed`}>
      <div className="flex flex-col gap-1.5">
        <span className={h}>Como usar</span>
        <ol className="flex flex-col gap-1.5">
          {guide.how.map((s, i) => (
            <li key={i} className="flex gap-2.5"><span className="mt-[1px] grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-[11px] text-link">{i + 1}</span><span>{s}</span></li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-1"><span className={h}>Por que é assim</span><p>{guide.why}</p></div>
      <div className="flex flex-col gap-1"><span className={h}>Quando usar</span><p>{guide.when}</p></div>
      {guide.origin && <p className="text-[12.5px] text-faint">{guide.origin}</p>}
    </div>
  )
}

// Cartão "Como funciona" no topo de uma visão. Aberto só na primeira vez que a pessoa abre a visão;
// depois fica só o botão "Como funciona" (guardado neste computador).
const helpKey = (id: string) => `tesseract.help.${id}`
function readHidden(id: string) { try { return localStorage.getItem(helpKey(id)) === '1' } catch { return false } }
export function HowItWorks({ id, title, guide }: { id: string; title: string; guide: Guide }) {
  const [open, setOpen] = useState(() => !readHidden(id))
  useEffect(() => {
    const first = !readHidden(id)
    setOpen(first)
    if (first) try { localStorage.setItem(helpKey(id), '1') } catch { /* sem armazenamento: abre toda vez */ }
  }, [id])
  const hide = () => { setOpen(false); try { localStorage.setItem(helpKey(id), '1') } catch { /* sem armazenamento: só fecha */ } }
  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 self-start text-[13px] text-link hover:underline">
      <HelpCircle size={14} />Como funciona: {title}
    </button>
  )
  return (
    <section aria-label={`Como funciona: ${title}`} className="anim-rise flex flex-col gap-4 rounded-[14px] border border-line bg-card p-5">
      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-link"><HelpCircle size={18} /></span>
        <div className="flex flex-1 flex-col"><span className="font-mono text-[10.5px] tracking-[0.14em] text-link">COMO FUNCIONA</span><h3 className="font-serif text-[19px]">{title}</h3></div>
        <Button variant="ghost" icon={X} ariaLabel="Esconder explicação" onClick={hide} />
      </header>
      <GuideBlock guide={guide} />
      <div><Button onClick={hide}>Entendi, esconder</Button></div>
    </section>
  )
}
