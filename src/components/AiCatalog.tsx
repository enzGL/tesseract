import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Check, Download } from 'lucide-react'
import { CATALOG, fits, gbLabel, visible } from '../data/ai-catalog'
import { call, inBrowser, message, type AiStatus } from '../data/api'
import { Badge, Button } from './ui'
import { openActivation, useLicense } from '../data/license'

// Modelos da IA local (a mesma lista da etapa "IA no seu computador" do instalador): o que já está
// no Ollama, o que cabe nesta memória e um botão para baixar, com o progresso.
type Pull = { model: string; pct: number; detail: string }

export function AiCatalog({ status, onChange }: { status: AiStatus | null; onChange: () => void }) {
  const [ram, setRam] = useState(0)
  const [pulling, setPulling] = useState<Pull | null>(null)
  const [error, setError] = useState('')
  const limited = !!useLicense()?.limited
  useEffect(() => { call<number>('ai_ram').then(setRam).catch(() => setRam(0)) }, [])
  useEffect(() => {
    if (inBrowser) return
    const off = listen<Pull>('ai-pull', (e) => setPulling(e.payload))
    return () => { void off.then((f) => f()) }
  }, [])

  const have = (id: string) => !!status?.models.some((m) => m.name === (id.includes(':') ? id : `${id}:latest`))
  const download = async (id: string) => {
    setError(''); setPulling({ model: id, pct: 0, detail: 'começando' })
    try { await call('ai_pull', { model: id }); onChange() }
    catch (e) { setError(`${id}: ${message(e)}`) }
    finally { setPulling(null) }
  }

  const models = visible(ram || 8).filter((m) => m.kind !== 'engine')
  return (
    <div className="flex flex-col gap-2 text-[13.5px]">
      {limited && <p className="text-[13px] text-muted">Baixar modelos para a IA no seu computador é do Pro. <button type="button" className="text-link hover:underline" onClick={() => openActivation('IA no seu computador')}>Ativar o Pro</button></p>}
      <p className="font-medium">Modelos para baixar {ram > 0 && <span className="font-normal text-muted">· este computador tem {ram} GB de memória</span>}</p>
      {!status?.ollama && <p className="text-[13px] text-muted">O Ollama não está ligado. Abra o Ollama, ou instale em ollama.com/download (o instalador do Tesseract também baixa, na etapa "IA no seu computador").</p>}
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {models.map((m) => {
          const ok = fits(m, ram || 8)
          const busy = pulling?.model === m.id
          return (
            <li key={m.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2"><b className="font-semibold">{m.name}</b><span className="font-mono text-[11.5px] text-muted">{gbLabel(m.gb)} · {m.kind === 'embed' ? 'busca' : 'conversa'}</span></div>
                <p className="text-[12.5px] text-muted">{m.use}{!ok && <span className="text-danger"> Pede {m.ramGb} GB de memória.</span>}</p>
                <p className="text-[11.5px] text-faint">{m.vendor} · {m.license}</p>
                {busy && <div className="mt-1.5 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(3, pulling.pct)}%` }} /></div><span className="font-mono text-[11px] text-muted">{pulling.detail}</span></div>}
              </div>
              {have(m.id)
                ? <Badge tone="ok"><Check size={12} /> instalado</Badge>
                : <Button variant="ghost" icon={Download} disabled={!status?.ollama || !!pulling} onClick={() => void download(m.id)}>{busy ? 'Baixando…' : 'Baixar'}</Button>}
            </li>
          )
        })}
      </ul>
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <p className="text-[12px] text-faint">Nomes e tamanhos do catálogo do Ollama ({CATALOG.length - 1} modelos; os maiores só aparecem com 16 GB ou mais).</p>
    </div>
  )
}
