import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, Copy, Database, Loader2, X } from 'lucide-react'
import { Button } from '../components/ui'
import { call, message, reload, type AppMode } from '../data/api'
import { seedTestData } from '../data/test-seed'

// Roteiro de teste da fase 4 (/teste). Cada passo diz o que fazer e o que conferir; a pessoa marca
// "funcionou" ou "deu problema" com uma anotação, e copia o relatório para mandar. Fica salvo neste computador.

type Step = { id: string; title: string; to: string; how: string[] }
const STEPS: Step[] = [
  { id: 'galeria', title: 'Galeria de modelos', to: '/projetos', how: ['Clique em "Novo projeto" (no nome do projeto, no topo).', 'Troque entre os modelos e leia o painel da direita.', 'Abra "Meus modelos": o "Site para cliente" deve estar lá. Crie um projeto com ele e confira as 4 tarefas de partida.'] },
  { id: 'configurar', title: 'Configurar o projeto', to: '/projetos', how: ['Abra Configurar. Ligue e desligue métodos: as abas no topo mudam depois de Salvar.', 'Mude algo e feche no X: ele deve perguntar se quer salvar.', 'Escolha a gaveta PARA e uma pasta do Conhecimento. Use "Salvar como modelo".'] },
  { id: 'quadro', title: 'Quadro, Lista e painel da tarefa', to: '/projetos', how: ['No "Site da Padaria Sol", arraste cartões entre colunas. "Fazendo" tem limite.', 'Clique num cartão: o painel abre à direita. Mude prazo, prioridade, checklist e Salve.', 'Crie uma tarefa pelo "+" de uma coluna (com texto e vazio).'] },
  { id: 'foco', title: 'Foco do dia', to: '/projetos', how: ['Aba Foco do dia: há uma tarefa no lugar 1. Ponha mais duas pelas candidatas.', 'Inicie "Focar 25 min" e pare depois de 1 minuto: o painel da tarefa mostra o tempo.', 'Troque a regra para 1-3-5 e Ivy Lee e leia o "Como funciona".'] },
  { id: 'eisenhower', title: 'Eisenhower', to: '/projetos', how: ['Projeto "Campanha de Natal" (escopo Agência Exemplo), aba Eisenhower.', 'Arraste tarefas entre os quadrantes e da bandeja "Sem quadrante".', 'Solte uma tarefa fora da matriz: ela volta para "Sem quadrante".'] },
  { id: 'gtd', title: 'GTD', to: '/projetos', how: ['Projeto "Vida pessoal", aba GTD. A caixa de entrada tem 3 itens.', 'Processe cada um por um caminho diferente: algum dia, aguardando, próxima ação com contexto.', 'Em Próximas ações, escolha "@telefone" e "até 15 min". Marque uma como feita e desmarque.', 'Aguardando: "Orçamento da reforma" deve avisar que vale cobrar (8 dias).'] },
  { id: 'scrum', title: 'Sprint e OKR', to: '/projetos', how: ['Projeto "App de agendamento", aba Sprint: a Sprint 2 está em andamento com barra e gráfico.', 'Aba Backlog: dê pontos e mande um item para a sprint.', 'Aba OKR: atualize o número de um resultado-chave.', 'Encerre a sprint com a retrospectiva e marque se a meta foi atingida.'] },
  { id: 'resumo', title: 'Resumo e resumos da operação', to: '/projetos', how: ['Aba Resumo do "App de agendamento": a Sprint 1 aparece com o relatório guardado.', 'Clique em "Gerar resumo da operação", troque os períodos, guarde.', 'Use "Copiar como texto" e cole num bloco de notas para conferir.'] },
  { id: 'morro', title: 'Shape Up e priorização', to: '/projetos', how: ['Projeto "Painel interno", aba Morro: arraste as frentes. "Gráfico por vendedor" avisa que está parado.', 'Aba Priorização: troque entre RICE, ICE e MoSCoW; mude um número e veja a ordem mudar.'] },
  { id: 'para', title: 'Visão PARA', to: '/projetos?para=1', how: ['Botão "Visão PARA" em Projetos: Vida pessoal está em Áreas, Referências de design em Recursos, Logo antigo no Arquivo.', 'Arraste um projeto para o Arquivo e traga de volta.'] },
  { id: 'calendario', title: 'Calendário', to: '/calendario', how: ['Semana: há blocos amanhã e depois de amanhã. Arraste um para outro horário.', 'Na lista "Sem horário", use o relógio para digitar dia e hora.', 'Clique no nome de um dia: o resumo abre. Mude a duração e crie uma tarefa com prazo.', 'Aba Linha do tempo: o marco "Publicar cardápio de Natal" aparece como losango.'] },
  { id: 'financas', title: 'Finanças', to: '/financas', how: ['Pessoal: a fatura do cartão aparece como atrasada. Clique em "Paguei".', 'Crie um lançamento repetindo 3 meses e avance os meses.', 'Troque para "Agência Exemplo": os números são outros.', 'Clique em "Resumo das receitas", troque os períodos e use "Copiar como texto".', 'Importe um extrato OFX ou CSV de verdade do seu banco e confira a prévia.'] },
  { id: 'crm', title: 'CRM e funil', to: '/crm', how: ['Troque o escopo para "Agência Exemplo": o funil tem 8 oportunidades, com números no topo.', 'Arraste um cartão para outro estágio. Clique nele: o painel abre. Registre um contato e use "+2 dias" no follow-up.', 'Solte a "Barbearia do Dom" em Ganho, com a receita: confira em Finanças (Agência Exemplo). Solte outra em Perdido e escolha o motivo.', 'Abas Empresas (ficha, contatos, linha do tempo, importar CSV), Follow-ups (atrasados e de hoje) e Relatórios.'] },
  { id: 'documentos', title: 'Documentos', to: '/contratos', how: ['Escopo "Agência Exemplo". Abra a proposta "Site com agendamento": a folha A4 aparece à direita com a marca da agência.', 'Mude um item ou valor e veja a folha mudar; use "Recalcular parcelas" se a soma não bater. Salve e clique em "Marcar como enviada": a Barbearia vai para "Proposta enviada" no CRM.', 'Clique em "Aceita": as 3 parcelas aparecem em Finanças como a receber. Use "Gerar PDF" (Salvar como PDF).', 'Abra o contrato da Contabilidade Prisma: a 1ª parcela está recebida. Clique em "Emitir recibo" e confira o recibo. Veja também "Versões".'] },
  { id: 'ganhos', title: 'Ganhos rápidos (fase 8.5)', to: '/configuracoes', how: ['Configurações > Notificações: clique em "Testar notificação" e confira o aviso do Windows.', 'Configurações > IA externa: ponha um limite (ex.: 5) e um endereço permitido; salve. Configurações > Exportar tudo: escolha uma pasta e abra o tesseract.json e um CSV no Excel.', 'Calendário: "Exportar .ics" e importe o arquivo no Google Agenda ou no Outlook.', 'Captura: em Configurações > Captura rápida, "Abrir a captura agora" (no app, também Ctrl+Shift+Espaço de qualquer programa). Escreva "mandar proposta pra Barbearia do Dom sexta 15h #vendas" e veja data, cliente e etiqueta; Enter guarda o follow-up.', 'Projetos > Site da Padaria Sol > aba Cronograma: barras no tempo e um aviso de conflito; clique em "Empurrar". Crie e tire uma dependência pelo +.', 'CRM (Agência Exemplo): a Ótica Visão Clara aparece "esfriando há 20 d" no cartão e no grupo Esfriando da aba Follow-ups. Na ficha de uma empresa, teste "Exportar dados" e "Anonimizar".'] },
  { id: 'escuro', title: 'Tema escuro e geral', to: '/', how: ['Ligue o tema escuro e passe por todas as telas acima: tudo legível?', 'Mãozinha do mouse em tudo que é clicável?'] },
]

type State = Record<string, { status?: 'ok' | 'bug'; note?: string }>
const KEY = 'tesseract.teste.fase4'
const load = (): State => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }

export function TestGuide() {
  const [mode, setMode] = useState<AppMode | null>(null)
  const [st, setSt] = useState<State>(load)
  const [log, setLog] = useState<string[]>([])
  const [seeding, setSeeding] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { call<AppMode>('app_mode').then(setMode).catch(() => setMode({ test: false, dataDir: '' })) }, [])
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(st)) } catch { /* sem armazenamento */ } }, [st])
  const set = (id: string, patch: State[string]) => setSt((s) => ({ ...s, [id]: { ...s[id], ...patch } }))
  const seed = async () => {
    setSeeding(true); setLog([])
    try { await seedTestData((l) => setLog((x) => [...x, l])); await reload() } catch (e) { setLog((x) => [...x, `Erro: ${message(e)}`]) }
    setSeeding(false)
  }
  const done = STEPS.filter((s) => st[s.id]?.status).length
  const report = () => [
    `Teste da fase 4 · ${new Date().toLocaleString('pt-BR')} · ${done} de ${STEPS.length} passos`, '',
    ...STEPS.map((s) => `${st[s.id]?.status === 'ok' ? '[ok]' : st[s.id]?.status === 'bug' ? '[PROBLEMA]' : '[ ]'} ${s.title}${st[s.id]?.note ? `\n    ${st[s.id]!.note}` : ''}`),
  ].join('\n')

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-12 py-10">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11px] tracking-[0.16em] text-link">ROTEIRO DE TESTE · FASE 4</span>
        <h1 className="font-serif text-[32px] leading-tight">Teste tudo em <em className="text-link">meia hora</em></h1>
        <p className="text-[14px] text-muted">Crie os dados de teste, siga os passos e marque o que funcionou. No fim, copie o relatório e mande. O progresso fica salvo neste computador.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-link"><Database size={18} /></span>
          <div className="flex flex-1 flex-col gap-1">
            <b className="text-[15px]">1. Dados de teste</b>
            {mode == null ? <span className="text-[13px] text-muted">Verificando o modo…</span>
              : mode.test ? <span className="text-[13px] text-muted">Modo de teste ligado. Banco: <span className="font-mono text-[12px]">{mode.dataDir}</span>. Seus dados reais não são tocados.</span>
              : <span className="text-[13px] text-[#B3261E] dark:text-[#FF8A80]">Este é o seu banco real. Para não misturar dados de teste com os seus, feche o app e abra pelo terminal com <span className="font-mono">npm run teste</span>.</span>}
          </div>
          {mode?.test && <Button variant="primary" icon={seeding ? Loader2 : Database} onClick={() => void seed()} disabled={seeding}>{seeding ? 'Criando…' : 'Criar dados de teste'}</Button>}
        </div>
        {log.length > 0 && <ul className="flex flex-col gap-0.5 rounded-lg bg-raised px-4 py-3 font-mono text-[12px] text-muted">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        {mode?.test && <p className="text-[12px] text-faint">Crie uma vez só. Para começar do zero: feche o app e rode <span className="font-mono">npm run teste:limpo</span>.</p>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3"><b className="text-[15px]">2. Passos</b><span className="text-[13px] text-muted">{done} de {STEPS.length} conferidos</span>
          <span className="flex h-[6px] flex-1 overflow-hidden rounded-full bg-line"><span className="rounded-full bg-ok" style={{ width: `${(done / STEPS.length) * 100}%` }} /></span></div>
        {STEPS.map((s, i) => {
          const v = st[s.id] ?? {}
          return (
            <article key={s.id} className={`flex flex-col gap-2.5 rounded-2xl border px-5 py-4 ${v.status === 'ok' ? 'kcard-done' : v.status === 'bug' ? 'border-[#B3261E]/40 bg-card' : 'border-line bg-card'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[12px] text-muted">{String(i + 1).padStart(2, '0')}</span>
                <b className="text-[15px]">{s.title}</b>
                <Link to={s.to} className="text-[13px] text-link hover:underline">Ir para a tela →</Link>
                <span className="flex-1" />
                <button type="button" aria-pressed={v.status === 'ok'} onClick={() => set(s.id, { status: v.status === 'ok' ? undefined : 'ok' })}
                  className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[12.5px] font-medium ${v.status === 'ok' ? 'bg-ok text-white' : 'border border-line-strong hover:border-ok'}`}><Check size={13} />Funcionou</button>
                <button type="button" aria-pressed={v.status === 'bug'} onClick={() => set(s.id, { status: v.status === 'bug' ? undefined : 'bug' })}
                  className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[12.5px] font-medium ${v.status === 'bug' ? 'bg-[#B3261E] text-white' : 'border border-line-strong hover:border-[#B3261E]'}`}><X size={13} />Deu problema</button>
              </div>
              <ol className="flex list-decimal flex-col gap-1 pl-10 text-[13.5px] leading-relaxed">{s.how.map((h, k) => <li key={k}>{h}</li>)}</ol>
              {v.status === 'bug' && <textarea value={v.note ?? ''} onChange={(e) => set(s.id, { note: e.target.value })} rows={2} placeholder="O que aconteceu? (dá para colar o print no chat depois)"
                className="rounded-lg border border-line-strong bg-raised p-3 text-[13.5px] outline-none focus:border-accent" />}
            </article>
          )
        })}
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-5">
        <b className="text-[15px]">3. Relatório</b><span className="flex-1 text-[13px] text-muted">Copia a lista com o que funcionou e o que deu problema, com as suas anotações.</span>
        <Button variant="primary" icon={copied ? Check : Copy} onClick={() => void navigator.clipboard.writeText(report()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) })}>{copied ? 'Copiado' : 'Copiar relatório'}</Button>
        <Button variant="ghost" onClick={() => setSt({})}>Recomeçar</Button>
      </section>
    </div>
  )
}
