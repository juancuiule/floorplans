import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { devApi } from './server/devServer.ts'
import { SpaceStore } from './server/storage.ts'

export default defineConfig(({ mode }) => {
  // FLOORPLAN_DATA is the folder with everyone's spaces (default storage/, git-ignored).
  const env = loadEnv(mode, process.cwd(), 'FLOORPLAN_')
  const store = new SpaceStore(path.resolve(env.FLOORPLAN_DATA || 'storage'), path.resolve('examples'))
  return {
    plugins: [react(), devApi(store)],
  }
})
