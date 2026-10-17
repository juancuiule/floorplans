import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { devApi } from './server/devServer.ts'
import { createApi } from './server/node.ts'

export default defineConfig(async ({ mode }) => {
  // FLOORPLAN_DATA is the folder with everyone's spaces (default storage/, git-ignored).
  const env = loadEnv(mode, process.cwd(), 'FLOORPLAN_')
  const dataDir = path.resolve(env.FLOORPLAN_DATA || 'storage')
  const api = await createApi({ dataDir, templatesDir: path.resolve('examples') })
  return {
    plugins: [react(), devApi(api, dataDir)],
  }
})
