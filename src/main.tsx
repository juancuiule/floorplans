import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { readPlan, setScope } from './decor/api'
import { launch } from './project/launch'
import { openPlan } from './project/plan'
import { rememberSpace } from './pages/recent'

// Startup: the URL says which page this is (docs/adr/0010). The 3D app needs its
// plan before its modules load, since many of them read it when imported
// (src/project/plan.ts), so the plan is fetched and opened first and the app is
// imported after.
//
//   /                                   home: your spaces, or a new one
//   /?space=<s>                         a space's plans
//   /?space=<s>&edit=floorplan[&plan=]  the floor plan editor
//   /?space=<s>&plan=<p>                the plan in 3D

const root = createRoot(document.getElementById('root')!)
const show = (node: ReactNode) => root.render(<StrictMode>{node}</StrictMode>)

async function start() {
  const { space, plan } = launch
  if (!space) {
    const { Home } = await import('./pages/Home')
    return show(<Home />)
  }
  rememberSpace(space)
  if (launch.floorplanEditor) {
    const { FloorplanEditorPage } = await import('./pages/floorplan/FloorplanEditorPage')
    return show(<FloorplanEditorPage space={space} plan={plan} />)
  }
  if (!plan) {
    const { SpacePage } = await import('./pages/SpacePage')
    return show(<SpacePage space={space} />)
  }
  try {
    const opened = openPlan(await readPlan(space, plan), `The plan "${plan}"`)
    document.title = `${opened.name} · Floorplan`
  } catch (e) {
    const { StartError } = await import('./pages/StartError')
    return show(<StartError space={space} message={e instanceof Error ? e.message : String(e)} />)
  }
  setScope(space, plan)
  const { default: App } = await import('./App')
  show(<App />)
}

void start()
