// Substituto de '@pro' no build do código aberto (sem a pasta pro/). Ver src/pro-bridge.ts.
import type { ProBridge } from './pro-bridge'

const Nothing = () => null

export const pro: ProBridge = { built: false, pages: {}, Settings: Nothing, FinanceImport: null, widgets: {}, seed: null, Shell: Nothing }
