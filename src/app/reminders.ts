// Notificações do Windows (fase 8.5). Enquanto o app está aberto, mesmo minimizado, confere a cada minuto:
// follow-ups do CRM, blocos de horário que começam em 10 minutos, tarefas que vencem hoje e contas do dia.
// Cada aviso sai uma vez só (fica marcado neste computador). Preferências em Configurações > Notificações.
import { useEffect } from 'react'
import { call, inBrowser, useScopes, type CalTask, type Tx } from '../data/api'
import { DEFAULT_PREFS, todayIso, type PrefsState } from '../data/extras'

const KEY = 'tesseract.notified'
const sent = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
function mark(id: string) {
  try {
    const s = sent(), t = todayIso()
    s[id] = t
    // guarda só os últimos 7 dias
    for (const k of Object.keys(s)) if (s[k] < new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)) delete s[k]
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch { /* sem armazenamento: pode repetir */ }
}

export async function notify(title: string, body: string): Promise<boolean> {
  if (inBrowser) {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'default') await Notification.requestPermission()
    if (Notification.permission !== 'granted') return false
    new Notification(title, { body }); return true
  }
  // pelo Rust (security::notify): com o app travado, o aviso sai sem detalhes ou nem sai
  try { await call('app_notify', { title, body }); return true } catch { return false }
}

type Opp = { id: number; companyId: number; company: string; title: string; stage: string; followUpAt: string | null; followUp: string }
const flag = (k: string) => { try { return localStorage.getItem(k) !== '0' } catch { return true } }
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

async function tick(scopes: string[]) {
  const { prefs } = await call<PrefsState>('extras_prefs').catch(() => ({ prefs: DEFAULT_PREFS }) as PrefsState)
  if (!prefs.notify) return
  const now = new Date(), today = todayIso(), time = hhmm(now), done = sent()
  const once = async (id: string, title: string, body: string) => { if (!done[id]) { mark(id); await notify(title, body) } }
  const morning = time >= '08:00'

  if (prefs.notifyFollowups) {
    const opps = (await Promise.all(scopes.map((s) => call<Opp[]>('crm_opportunities', { scope: s }).catch(() => [] as Opp[])))).flat()
      .filter((o) => o.stage !== 'ganho' && o.stage !== 'perdido' && o.followUpAt)
    for (const o of opps) {
      const at = o.followUpAt!, day = at.slice(0, 10)
      // com hora: avisa na hora marcada (até 2 horas depois, se o app estava fechado)
      if (at.length > 10 && day === today && at.slice(11, 16) <= time && at.slice(11, 16) >= hhmm(new Date(now.getTime() - 2 * 36e5)))
        await once(`fu-${o.id}-${at}`, `Follow-up: ${o.company}`, o.followUp || o.title)
    }
    const late = opps.filter((o) => o.followUpAt!.slice(0, 10) < today)
    const allDay = opps.filter((o) => o.followUpAt!.length === 10 && o.followUpAt === today)
    if (morning && late.length) await once(`fu-late-${today}`, `${late.length} follow-up(s) atrasado(s)`, late.slice(0, 3).map((o) => o.company).join(', ') + (late.length > 3 ? '…' : ''))
    if (morning && allDay.length) await once(`fu-day-${today}`, `${allDay.length} follow-up(s) para hoje`, allDay.slice(0, 3).map((o) => o.company).join(', ') + (allDay.length > 3 ? '…' : ''))
    // briefing (fase 12): aviso 30 minutos antes e montagem às 8h do dia (só IA local; externa pede o sim na tela)
    const todays = opps.filter((o) => o.followUpAt!.slice(0, 10) === today)
    if (flag('tesseract.briefing.warn')) {
      const soon = hhmm(new Date(now.getTime() + 30 * 6e4))
      for (const o of todays) {
        const at = o.followUpAt!.slice(11, 16)
        if (at && at > time && at <= soon) await once(`brief-${o.id}-${o.followUpAt}`, `Às ${at}: ${o.company}`, `${o.followUp || o.title}. O briefing está em Comercial › Briefing.`)
      }
    }
    if (flag('tesseract.briefing.auto') && morning) {
      for (const o of todays) {
        if (done[`brief-auto-${o.companyId}-${today}`]) continue
        mark(`brief-auto-${o.companyId}-${today}`)
        await call('briefing_build', { company: o.companyId, meetingAt: o.followUpAt, meetingTitle: o.followUp || o.title, today, consent: false, useAi: true }).catch(() => {})
      }
    }
  }

  if (prefs.notifyBlocks || prefs.notifyTasks) {
    const cal = await call<CalTask[]>('calendar_range', { from: today, to: today }).catch(() => [] as CalTask[])
    if (prefs.notifyBlocks) {
      const soon = hhmm(new Date(now.getTime() + 10 * 6e4))
      for (const c of cal) {
        const s = c.task.schedStart
        if (!c.done && s && s.slice(0, 10) === today && s.slice(11, 16) > time && s.slice(11, 16) <= soon)
          await once(`block-${c.task.id}-${s}`, `Começa às ${s.slice(11, 16)}: ${c.task.title}`, c.project)
      }
    }
    if (prefs.notifyTasks && morning) {
      const due = cal.filter((c) => !c.done && c.task.due === today)
      if (due.length) await once(`due-${today}`, `${due.length} tarefa(s) vencem hoje`, due.slice(0, 3).map((c) => c.task.title).join(', ') + (due.length > 3 ? '…' : ''))
    }
  }

  if (prefs.notifyMoney && morning) {
    const txs = (await Promise.all(scopes.map((s) => call<Tx[]>('finance_list', { scope: s, from: today, to: today }).catch(() => [] as Tx[])))).flat().filter((t) => !t.paidAt && t.due === today)
    const pay = txs.filter((t) => t.kind === 'out').length, get = txs.filter((t) => t.kind === 'in').length
    if (pay || get) await once(`money-${today}`, 'Contas de hoje', [pay && `${pay} a pagar`, get && `${get} a receber`].filter(Boolean).join(' · '))
    // cobrança (fase 12): parcelas a receber já vencidas e sem baixa, uma vez por manhã
    const late = (await Promise.all(scopes.map((s) => call<Tx[]>('finance_overdue', { scope: s, today }).catch(() => [] as Tx[])))).flat().filter((t) => t.kind === 'in')
    if (late.length) {
      const total = late.reduce((s, t) => s + t.amount, 0) / 100
      await once(`charge-${today}`, `${late.length} parcela(s) atrasada(s) para cobrar`, `${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} no total. Abra Cobrança para mandar a mensagem pronta.`)
    }
  }
}

/** Montado uma vez no Shell. */
export function useReminders() {
  const scopes = useScopes().map((s) => s.id).join('|')
  useEffect(() => {
    const list = scopes.split('|')
    let busy = false
    const run = () => { if (busy) return; busy = true; void tick(list).catch(() => {}).finally(() => { busy = false }) }
    const first = setTimeout(run, 15_000)
    const every = setInterval(run, 60_000)
    return () => { clearTimeout(first); clearInterval(every) }
  }, [scopes])
}
