import { useEffect, useState } from 'react'
import { Eye, EyeOff, Plus } from 'lucide-react'
import { Button } from './ui'
import { call, inBrowser, message } from '../data/api'
import { STAGES } from '../data/crm'
import { DEFAULT_LOST, DEFAULT_TERMS, PACKS, TERM_LABELS, defaultStageName, saveVocab, useVocab, type Lost, type TermKey, type Vocab } from '../data/vocab'

// Configurações › Vocabulário (fase 12). Desenho: a sugestão, com o dicionário (A), os pacotes por
// área em "Começar de" (C) e o lápis no próprio funil para os estágios (B). Os motivos de perda ficam ao lado,
// com quantas vezes cada um já foi usado; motivo usado só se esconde, para o relatório continuar certo.

const label = 'font-mono text-[11px] tracking-[0.16em] uppercase text-muted'
const field = 'h-9 w-full rounded-lg border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-accent'

export function VocabCard() {
  const saved = useVocab()
  const [v, setV] = useState<Vocab>(saved)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [newReason, setNewReason] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => { setV(saved) }, [JSON.stringify(saved)]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (inBrowser) return
    call<[string, number][]>('crm_lost_counts').then((r) => setCounts(Object.fromEntries(r))).catch(() => undefined)
  }, [])

  const t = (k: TermKey) => v.terms?.[k] ?? ''
  const setTerm = (k: TermKey, val: string) => setV({ ...v, terms: { ...v.terms, [k]: val } })
  const lost: Lost[] = v.lost ?? DEFAULT_LOST.map((name) => ({ name }))
  // motivos já usados em oportunidades e que não estão na lista aparecem também (para poder esconder)
  const extra = Object.keys(counts).filter((r) => !lost.some((l) => l.name === r)).map((name) => ({ name, hidden: true }))
  const setLost = (l: Lost[]) => setV({ ...v, lost: l })
  const dirty = JSON.stringify(v) !== JSON.stringify(saved)
  const show = (k: TermKey) => (t(k).trim() || DEFAULT_TERMS[k])
  const stageName = (id: string) => v.stages?.[id as keyof NonNullable<Vocab['stages']>]?.name?.trim() || defaultStageName(id)
  const save = async (next: Vocab, text: string) => {
    setMsg(null)
    try { await saveVocab(next); setMsg({ tone: 'ok', text }) } catch (e) { setMsg({ tone: 'error', text: message(e) }) }
  }
  const addReason = () => {
    const n = newReason.trim()
    if (!n || lost.some((l) => l.name.toLowerCase() === n.toLowerCase())) return
    setLost([...lost, { name: n }]); setNewReason('')
  }
  const toggle = (name: string) => {
    const has = lost.find((l) => l.name === name)
    if (has) {
      // sem uso: sai da lista; com uso: só esconde
      if (!counts[name] && !has.hidden) setLost(lost.filter((l) => l.name !== name))
      else setLost(lost.map((l) => (l.name === name ? { ...l, hidden: !l.hidden } : l)))
    } else setLost([...lost, { name }])
  }

  return (
    <section aria-label="Vocabulário" className="anim-rise flex flex-col overflow-hidden rounded-xl border border-line bg-card">
      <div className="flex flex-wrap">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4 p-6">
          <header className="flex flex-col gap-1.5">
            <span className={label}>Vocabulário</span>
            <h2 className="font-serif text-[22px] leading-tight">Do jeito que você fala</h2>
            <p className="max-w-[620px] text-[13.5px] leading-relaxed text-muted">Muda só os nomes no funil, nos relatórios e nas mensagens. Os dados ficam iguais.</p>
          </header>
          {msg && <p role={msg.tone === 'error' ? 'alert' : 'status'} className={`text-[13.5px] ${msg.tone === 'error' ? 'text-[#B3261E]' : 'text-ok'}`}>{msg.text}</p>}
          <div role="group" aria-label="Começar de um pacote" className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted">Começar de:</span>
            {PACKS.map((p) => (
              <button key={p.id} type="button" aria-pressed={v.pack === p.id} title={p.about} onClick={() => setV({ ...p.vocab })}
                className={`h-9 rounded-full px-3.5 text-[13px] ${v.pack === p.id ? 'bg-accent text-on-accent' : 'border border-line-strong bg-card hover:bg-raised'}`}>{p.name}</button>
            ))}
            <button type="button" aria-pressed={!v.pack && !v.terms && !v.stages && !v.lost} onClick={() => setV({})}
              className={`h-9 rounded-full px-3.5 text-[13px] ${!v.pack && !v.terms && !v.stages && !v.lost ? 'bg-accent text-on-accent' : 'border border-line-strong bg-card hover:bg-raised'}`}>Padrão</button>
          </div>
          <div className="grid grid-cols-1 items-center gap-x-4 gap-y-2 rounded-[14px] border border-line px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            {TERM_LABELS.map(([k, name]) => <label key={k} className="contents"><span className="text-[13.5px] text-muted">{name}</span>
              <input value={t(k)} placeholder={DEFAULT_TERMS[k]} maxLength={30} onChange={(e) => setTerm(k, e.target.value)} className={field} /></label>)}
          </div>
          <div className="flex flex-col gap-2 rounded-[14px] border border-line px-4 py-4">
            <span className={`${label} !text-link`}>Estágios do funil</span>
            <div className="flex flex-wrap gap-2 text-[13.5px]">
              {STAGES.map((s) => {
                const hidden = v.stages?.[s.id]?.hidden
                return <span key={s.id} className={`rounded-full px-3 py-1 ${s.id === 'ganho' ? 'bg-ok-bg text-ok' : 'bg-raised'} ${hidden ? 'text-faint line-through' : ''}`}>{stageName(s.id)}</span>
              })}
            </div>
            <span className="text-[12.5px] text-muted">Para renomear ou esconder um estágio, use o lápis no nome da coluna, no próprio funil.</span>
          </div>
          <div className="rounded-[14px] bg-accent-soft px-4 py-3 text-[14px] leading-relaxed">
            <span className={`${label} !text-link`}>Como fica</span><br />
            "3 <b>{show('oportunidades')}</b> em <b>{stageName('proposta')}</b>; a mais antiga é de <b>{show('empresa')}</b> Marina Lopes, há 9 dias."
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!dirty} onClick={() => void save(v, 'Vocabulário salvo. O funil já fala assim.')}>Salvar</Button>
            <Button disabled={!saved.pack && !saved.terms && !saved.stages && !saved.lost} onClick={() => void save({}, 'Voltou ao vocabulário padrão.')}>Voltar ao padrão</Button>
          </div>
        </div>
        <div role="group" aria-label="Motivos de perda" className="flex max-w-[400px] flex-[1_1_320px] flex-col gap-3 border-l border-line bg-raised/60 px-6 py-6">
          <span className={label}>Motivos de perda</span>
          <h3 className="font-serif text-[20px] leading-tight">Por que não fechou</h3>
          <ul className="flex flex-col text-[14px]">
            {[...lost, ...extra].map((l) => (
              <li key={l.name} className="flex items-center justify-between gap-2 border-b border-line py-2">
                <span className={l.hidden ? 'text-faint line-through' : ''}>{l.name}</span>
                <span className="flex items-center gap-2 text-[12.5px] text-muted">
                  {counts[l.name] ? `${counts[l.name]} ${counts[l.name] === 1 ? 'vez' : 'vezes'}` : l.hidden ? 'escondido' : ''}
                  <button type="button" onClick={() => toggle(l.name)} aria-label={l.hidden ? `Mostrar ${l.name}` : `Esconder ${l.name}`} title={l.hidden ? 'Mostrar' : counts[l.name] ? 'Esconder (já foi usado)' : 'Tirar da lista'}
                    className="rounded p-1 hover:bg-hover hover:text-fg">{l.hidden ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                </span>
              </li>
            ))}
          </ul>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addReason() }}>
            <input aria-label="Novo motivo" value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="ex.: mudou de cidade" maxLength={40} className={field} />
            <Button type="submit" icon={Plus} ariaLabel="Adicionar motivo" />
          </form>
          <p className="text-[12.5px] text-muted">Motivo já usado só se esconde, para o relatório de perdas continuar certo. Salve à esquerda.</p>
        </div>
      </div>
    </section>
  )
}
