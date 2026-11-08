import { useEffect, useState, type ReactNode } from 'react'
import { pro } from '@pro'
import { VocabCard } from '../components/VocabCard'
import { AiCatalog } from '../components/AiCatalog'
import { UpdatesCard } from '../components/Updates'
import { SecurityCard } from '../components/Security'
import { Link } from 'react-router'
import { Archive, ArchiveRestore, Check, DatabaseBackup, FolderSearch, KeyRound, Pencil, Plus, RotateCcw, Sparkles, X } from 'lucide-react'
import { Badge, Button, PageHeader } from '../components/ui'
import { ExtrasSettings } from '../components/ExportCard'
import { PREV_SEGMENT } from '../app/SegmentPicker'
import {
  call, embedAll, inBrowser, message, PROVIDERS, reload, setSetting, useStore,
  type AiMode, type AiStatus, type BackupFile, type DbInfo, type ProviderId, type VaultCheck,
} from '../data/api'

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`)
const when = (secs: number) => new Date(secs * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const field = 'h-10 rounded-lg border border-line-strong bg-raised px-3 text-[14px] outline-none focus:border-accent'

function Card({ title, desc, children, aside }: { title: string; desc: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="anim-rise grid gap-6 rounded-xl border border-line bg-card p-6 md:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <div className="flex items-center gap-2"><h2 className="text-[17px] font-semibold">{title}</h2>{aside}</div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{desc}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  )
}

function Note({ tone = 'muted', children }: { tone?: 'muted' | 'error' | 'ok'; children: ReactNode }) {
  const c = { muted: 'text-muted', error: 'text-[#B3261E]', ok: 'text-ok' }[tone]
  return <p role={tone === 'error' ? 'alert' : undefined} className={`text-[13.5px] ${c}`}>{children}</p>
}

function DataAndBackups() {
  const { settings } = useStore()
  const [info, setInfo] = useState<DbInfo | null>(null)
  const [list, setList] = useState<BackupFile[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const load = () => Promise.all([call<DbInfo>('db_info'), call<BackupFile[]>('backups_list')]).then(([i, l]) => { setInfo(i); setList(l) })
  useEffect(() => { load().catch((e) => setMsg({ tone: 'error', text: message(e) })) }, [])

  const backup = async () => {
    setBusy(true); setMsg(null)
    try { const b = await call<BackupFile>('backup_now'); setMsg({ tone: 'ok', text: `Backup criado: ${b.name}` }); await load() }
    catch (e) { setMsg({ tone: 'error', text: message(e) }) }
    finally { setBusy(false) }
  }
  const [confirm, setConfirm] = useState<string | null>(null)
  const restore = async (name: string) => {
    setBusy(true); setMsg(null)
    try {
      const safety = await call<string>('backup_restore', { name })
      setConfirm(null)
      setMsg({ tone: 'ok', text: `Dados restaurados. O estado anterior foi guardado em ${safety}.` })
      await Promise.all([load(), reload()])
    } catch (e) { setMsg({ tone: 'error', text: message(e) }) }
    finally { setBusy(false) }
  }
  const auto = settings['backup.auto'] ?? true
  const keep = settings['backup.keep'] ?? 10

  return (
    <Card title="Dados e backups" desc="Tudo fica num arquivo SQLite no seu computador. Backups são cópias consistentes feitas com VACUUM INTO, nunca cópia do arquivo em uso."
      aside={info && <Badge tone={info.schemaVersion === info.latestSchema ? 'ok' : 'muted'}>Esquema v{info.schemaVersion}</Badge>}>
      {info && (
        <dl className="grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt className="text-muted">Banco</dt><dd className="truncate font-mono text-[12.5px]" title={info.path}>{info.path}</dd>
          <dt className="text-muted">Tamanho</dt><dd>{bytes(info.bytes)}</dd>
          <dt className="text-muted">Backups em</dt><dd className="truncate font-mono text-[12.5px]" title={info.backupsDir}>{info.backupsDir}</dd>
          {info.startup.backupBeforeMigration && <><dt className="text-muted">Antes de migrar</dt><dd>{info.startup.backupBeforeMigration}</dd></>}
        </dl>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button variant="primary" icon={DatabaseBackup} onClick={backup}>{busy ? 'Fazendo backup…' : 'Fazer backup agora'}</Button>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={auto} onChange={(e) => setSetting('backup.auto', e.target.checked)} className="size-4 accent-[var(--t-accent)]" />
          Backup automático diário (ao abrir o app)
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          Manter
          <input type="number" min={1} max={100} value={keep} onChange={(e) => { const n = Math.round(+e.target.value); if (n >= 1 && n <= 100) setSetting('backup.keep', n) }} className={`${field} h-9 w-20`} />
          mais recentes
        </label>
      </div>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {list.length === 0 && <li className="px-4 py-5 text-center text-[13.5px] text-muted">Nenhum backup ainda.</li>}
        {list.map((b) => confirm === b.name ? (
          <li key={b.name} className="flex flex-wrap items-center gap-3 bg-accent-soft/50 px-4 py-2.5 text-[13.5px]" role="alert">
            <span className="min-w-0 flex-1">Trocar os dados atuais pelo backup de <b className="font-medium">{when(b.modified)}</b>? O estado de agora fica guardado como backup antes.</span>
            <Button variant="primary" icon={RotateCcw} onClick={() => restore(b.name)}>{busy ? 'Restaurando…' : 'Restaurar'}</Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancelar</Button>
          </li>
        ) : (
          <li key={b.name} className="group flex items-center gap-4 px-4 py-2 text-[13.5px]">
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]" title={b.path}>{b.name}</span>
            <span className="text-muted">{bytes(b.bytes)}</span>
            <span className="w-32 text-right text-muted">{when(b.modified)}</span>
            <Button variant="ghost" icon={RotateCcw} title="Restaurar este backup" ariaLabel={`Restaurar ${b.name}`} onClick={() => { setMsg(null); setConfirm(b.name) }} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Vault() {
  const { settings } = useStore()
  const [path, setPath] = useState('')
  const [check, setCheck] = useState<VaultCheck | null>(null)
  const [busy, setBusy] = useState(false)
  const saved = settings['vault.path'] ?? ''
  useEffect(() => { setPath(saved) }, [saved])

  const verify = async () => {
    setBusy(true)
    try { setCheck(await call<VaultCheck>('vault_check', { path })) } finally { setBusy(false) }
  }
  const save = async () => { await setSetting('vault.path', path.trim()) }

  return (
    <Card title="Conhecimento" desc="Pasta da sua base de conhecimento (vault do Obsidian ou notas .md). O Tesseract só lê, indexa e busca por texto e por significado."
      aside={saved ? <Badge tone="ok">Definido</Badge> : <Badge tone="muted">Não definido</Badge>}>
      <div className="flex flex-wrap gap-2">
        <label className="min-w-0 flex-1"><span className="sr-only">Caminho do vault</span>
          <input value={path} onChange={(e) => { setPath(e.target.value); setCheck(null) }} placeholder="C:\Users\voce\Documents\vault" className={`${field} w-full font-mono text-[13px]`} />
        </label>
        <Button icon={FolderSearch} onClick={verify}>{busy ? 'Verificando…' : 'Verificar'}</Button>
        <Button variant="primary" onClick={save}>Salvar</Button>
      </div>
      {check && (check.exists
        ? <Note tone="ok">{check.capped ? 'Mais de ' : ''}{check.notes.toLocaleString('pt-BR')} notas .md{check.obsidian ? ' · vault do Obsidian' : ' · pasta sem .obsidian (funciona, mas confira o caminho)'}</Note>
        : <Note tone="error">Pasta não encontrada.</Note>)}
      {saved && path.trim() !== saved && <Note>Alteração não salva.</Note>}
      <label className="flex items-start gap-2 text-[14px]">
        <input type="checkbox" checked={settings['vault.sensitive'] ?? false} onChange={(e) => setSetting('vault.sensitive', e.target.checked)} className="mt-0.5 size-4 accent-[var(--t-accent)]" />
        <span>Incluir pastas sensíveis (<code className="font-mono text-[12.5px]">financas/</code>, <code className="font-mono text-[12.5px]">pessoal/</code>) na busca semântica<span className="block text-[13px] text-muted">Desligado por padrão. Mesmo ligado, nada sai para provedor externo sem seu consentimento.</span></span>
      </label>
    </Card>
  )
}

function Organizations() {
  const { orgs } = useStore()
  const [name, setName] = useState('')
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (f: () => Promise<unknown>) => { setError(null); try { await f(); await reload() } catch (e) { setError(message(e)) } }

  return (
    <Card title="Organizações" desc="Cada organização vira um escopo no seletor da barra lateral. Arquivar esconde do seletor sem apagar nada.">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) run(async () => { await call('org_save', { id: null, name }); setName('') }) }}>
        <label className="flex-1"><span className="sr-only">Nova organização</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da organização" className={`${field} w-full`} />
        </label>
        <Button type="submit" icon={Plus}>Adicionar</Button>
      </form>
      {error && <Note tone="error">{error}</Note>}
      <ul className="divide-y divide-line rounded-lg border border-line">
        {orgs.length === 0 && <li className="px-4 py-5 text-center text-[13.5px] text-muted">Nenhuma organização. Seu escopo Pessoal sempre existe.</li>}
        {orgs.map((o) => (
          <li key={o.id} className={`flex items-center gap-3 px-4 py-2 text-[14px] ${o.archived ? 'text-faint' : ''}`}>
            {edit?.id === o.id ? (
              <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await call('org_save', { id: o.id, name: edit.name }); setEdit(null) }) }}>
                <input autoFocus value={edit.name} onChange={(e) => setEdit({ id: o.id, name: e.target.value })} aria-label="Novo nome" className={`${field} h-9 flex-1`} />
                <Button type="submit" variant="ghost" icon={Check} ariaLabel="Salvar nome" />
                <Button variant="ghost" icon={X} ariaLabel="Cancelar" onClick={() => setEdit(null)} />
              </form>
            ) : (
              <>
                <span className="min-w-[6rem] flex-1 truncate">{o.name}</span>
                <span className="hidden max-w-[9rem] shrink truncate font-mono text-[12px] whitespace-nowrap text-faint 2xl:inline" title={`org:${o.id}`}>org:{o.id}</span>
                <span className="shrink-0 text-right text-[13px] whitespace-nowrap text-muted">{o.projects} {o.projects === 1 ? 'projeto' : 'projetos'}</span>
                {o.archived && <Badge tone="muted">Arquivada</Badge>}
                <Button variant="ghost" icon={Pencil} ariaLabel={`Renomear ${o.name}`} title="Renomear" onClick={() => setEdit({ id: o.id, name: o.name })} />
                <Button variant="ghost" icon={o.archived ? ArchiveRestore : Archive} ariaLabel={o.archived ? `Restaurar ${o.name}` : `Arquivar ${o.name}`} title={o.archived ? 'Restaurar' : 'Arquivar'}
                  onClick={() => run(() => call('org_archive', { id: o.id, archived: !o.archived }))} />
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ---------- IA e privacidade ----------
const select = `${field} h-10 pr-8`

function Ai() {
  const { settings, embed } = useStore()
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const refresh = () => call<AiStatus>('ai_status').then(setStatus).catch((e) => setMsg({ tone: 'error', text: message(e) }))
  useEffect(() => { refresh() }, [embed.done])
  // modelo baixado no Ollama com o app aberto: atualiza ao voltar para a janela
  useEffect(() => { const f = () => refresh(); window.addEventListener('focus', f); return () => window.removeEventListener('focus', f) }, [])

  // provedor externo é do Pro: no build aberto, o chat usa só a IA local
  const mode = pro.built ? settings['ai.mode'] ?? 'auto' : 'local'
  const pid = settings['ai.provider'] ?? 'groq'
  const prov = PROVIDERS.find((p) => p.id === pid) ?? PROVIDERS[0]
  const chatModels = status?.models.filter((m) => !m.embedding) ?? []
  const hasKey = !!status?.keys[pid]

  const saveKey = async () => {
    setMsg(null)
    try { await call('ai_key_set', { provider: pid, key }); setKey(''); setMsg({ tone: 'ok', text: 'Chave guardada no Cofre de Credenciais do Windows.' }); refresh() }
    catch (e) { setMsg({ tone: 'error', text: message(e) }) }
  }
  const clearKey = async () => { await call('ai_key_clear', { provider: pid }); refresh() }
  const pickProvider = (id: ProviderId) => {
    setSetting('ai.provider', id)
    const p = PROVIDERS.find((x) => x.id === id)
    if (p?.model) setSetting('ai.externalModel', p.model) // modelo sugerido do provedor escolhido
  }

  return (
    <Card title="IA e privacidade" desc="A IA lê só os trechos das suas notas que respondem à pergunta. Local fica no seu computador; externo só recebe algo depois que você vê e aprova o que vai sair."
      aside={<Badge tone={status?.ollama ? 'ok' : 'muted'}>{status?.ollama ? 'Ollama ligado' : 'Ollama desligado'}</Badge>}>
      <div className="flex flex-col gap-2 text-[13.5px]">
        <p className="font-medium">Busca por significado</p>
        {!status ? <Note>Verificando…</Note> : status.embedReady
          ? <Note tone={embed.done >= embed.total && embed.total > 0 ? 'ok' : 'muted'}>{embed.running ? `Gerando vetores… ${embed.done} de ${embed.total} trechos` : `${status.vectorsDone} de ${status.vectorsTotal} trechos com vetor (bge-m3, local).`}</Note>
          : <Note>{status.ollama ? 'Instale o modelo de busca: ' : 'Abra o Ollama e instale o modelo de busca: '}<code className="font-mono text-[12.5px]">ollama pull bge-m3</code></Note>}
        {embed.error && <Note tone="error">{embed.error}</Note>}
        {status?.embedReady && !embed.running && status.vectorsDone < status.vectorsTotal && <div><Button icon={Sparkles} onClick={() => embedAll()}>Gerar agora</Button></div>}
      </div>

      {pro.built && <label className="flex flex-col gap-1.5 text-[13.5px]"><span className="font-medium">Quem responde no chat</span>
        <select value={mode} onChange={(e) => setSetting('ai.mode', e.target.value as AiMode)} className={select}>
          <option value="auto">Automático: local quando estiver ligado, senão o externo (com sua permissão)</option>
          <option value="local">Só local (nada sai do computador)</option>
          <option value="external">Só externo (com sua permissão a cada envio)</option>
        </select>
      </label>}

      {mode !== 'external' && (
        <label className="flex flex-col gap-1.5 text-[13.5px]"><span className="font-medium">Modelo local (Ollama)</span>
          {chatModels.length ? (
            <select value={settings['ai.localModel'] ?? ''} onChange={(e) => setSetting('ai.localModel', e.target.value)} className={select}>
              <option value="">Escolha um modelo</option>
              {chatModels.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          ) : <div className="flex flex-wrap items-center gap-3"><Note>Nenhum modelo de conversa instalado. Para 8 GB de memória, um modelo de 3B: <code className="font-mono text-[12.5px]">ollama pull llama3.2:3b</code></Note><Button variant="ghost" icon={RotateCcw} onClick={refresh}>Verificar de novo</Button></div>}
        </label>
      )}

      {mode !== 'external' && <AiCatalog status={status} onChange={refresh} />}

      {mode !== 'local' && (
        <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <label className="flex flex-col gap-1.5 text-[13.5px]"><span className="font-medium">Provedor externo</span>
            <select value={pid} onChange={(e) => pickProvider(e.target.value as ProviderId)} className={select}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {!prov.private && <Note tone="error">Atenção: a política deste provedor permite registrar ou usar para treino o que você envia. Prefira para perguntas sem dado sensível.</Note>}
          {pid === 'custom' && (
            <label className="flex flex-col gap-1.5 text-[13.5px]">Endereço da API (https)
              <input value={settings['ai.externalBase'] ?? ''} onChange={(e) => setSetting('ai.externalBase', e.target.value)} placeholder="https://api.exemplo.com/v1" className={`${field} font-mono text-[13px]`} />
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-[13.5px]">Modelo
            <input value={settings['ai.externalModel'] ?? ''} onChange={(e) => setSetting('ai.externalModel', e.target.value)} placeholder={prov.model || 'nome-do-modelo'} className={`${field} font-mono text-[13px]`} />
            <span className="text-[12.5px] text-faint">Sugestão; confira o nome atual no site do provedor.{prov.keyUrl && ` Chave em ${prov.keyUrl}.`}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="min-w-[240px] flex-1"><span className="sr-only">Chave da API</span>
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? 'Chave guardada (digite para trocar)' : 'Cole a chave da API'} autoComplete="off" className={`${field} w-full font-mono text-[13px]`} />
            </label>
            <Button variant="primary" icon={KeyRound} onClick={saveKey}>Guardar chave</Button>
            {hasKey && <Button variant="ghost" onClick={clearKey}>Remover</Button>}
          </div>
          <Note>{hasKey ? 'Chave guardada no Cofre do Windows. Ela nunca fica no banco do Tesseract nem aparece de novo na tela.' : 'Sem chave, o provedor externo não é usado.'}</Note>
        </div>
      )}
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
    </Card>
  )
}

export function Settings() {
  const { error, settings } = useStore()
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-16 py-12">
      <PageHeader title="Configurações" subtitle="Dados locais, backups, vault e organizações." badge={inBrowser ? <Badge tone="muted">Navegador: sem banco</Badge> : undefined} />
      {error && <Note tone="error">{error}</Note>}
      <Card title="Seu negócio" desc="O modelo escolhido monta o menu, o quadro e o Início. Troque de modelo ou ajuste o menu quando quiser.">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
          <Link to="/personalizar" className="text-link hover:underline">Personalizar o menu →</Link>
          <button type="button" onClick={() => { try { localStorage.setItem(PREV_SEGMENT, String(settings['ui.segment'] ?? '')) } catch { /* sem armazenamento */ } void setSetting('ui.segment', '') }} className="text-link hover:underline">Trocar de modelo →</button>
        </div>
      </Card>
      <VocabCard />
      <SecurityCard />
      {/* backup na nuvem e dois computadores (Pro, pasta pro/ui) */}
      <pro.Settings />
      <DataAndBackups />
      <Vault />
      <Organizations />
      <Ai />
      <UpdatesCard Card={Card} />
      <ExtrasSettings />
      <Card title="Teste do app" desc="Roteiro passo a passo para conferir cada tela, com dados de teste num banco separado (npm run teste).">
        <Link to="/teste" className="text-[14px] text-link hover:underline">Abrir o roteiro de teste →</Link>
      </Card>
    </div>
  )
}
