import { createHashRouter } from 'react-router'
import { Shell } from './Shell'
import { ALL_MODULES, SETTINGS } from './nav'
import { Overview } from '../pages/Overview'
import { ModulePage } from '../pages/ModulePage'
import { Settings } from '../pages/Settings'
import { Plan } from '../pages/Plan'
import { Brain } from '../pages/Brain'
import { Guide } from '../pages/Guide'
import { Shortcuts } from '../pages/Shortcuts'
import { Projects } from '../pages/Projects'
import { Calendar } from '../pages/Calendar'
import { Finance } from '../pages/Finance'
import { TestGuide } from '../pages/TestGuide'
import { Tutorial } from '../pages/Tutorial'
import { MenuEditor } from '../pages/MenuEditor'
import { ProOnly } from '../pages/ProOnly'
import { pro } from '@pro'

// Hash router: o app roda empacotado no Tauri, sem servidor para reescrever rotas.
export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Overview /> },
      { path: SETTINGS.path.slice(1), element: <Settings /> },
      { path: 'plano', element: <Plan /> },
      { path: 'cerebro', element: <Brain /> },
      { path: 'guia', element: <Guide /> },
      { path: 'atalhos', element: <Shortcuts /> },
      { path: 'projetos', element: <Projects /> },
      { path: 'calendario', element: <Calendar /> },
      { path: 'financas', element: <Finance /> },
      { path: 'teste', element: <TestGuide /> },
      { path: 'tutorial', element: <Tutorial /> },
      { path: 'personalizar', element: <MenuEditor /> },
      // telas do Pro: do pro/ui quando o build tem o Pro; senão, o aviso de que são do instalador oficial
      ...ALL_MODULES.filter((m) => m.pro).map((m) => {
        const Page = pro.pages[m.path]
        return { path: m.path.slice(1), element: Page ? <Page /> : <ProOnly module={m} /> }
      }),
      ...ALL_MODULES.filter((m) => !m.pro && !['/', '/cerebro', '/projetos', '/calendario', '/financas', '/tutorial'].includes(m.path) && m !== SETTINGS).map((m) => ({ path: m.path.slice(1), element: <ModulePage /> })),
    ],
  },
])
