// Copies a workspace folder (examples/<name>/, docs/adr/0009) into a new space,
// with its plans, layouts and artwork, and prints the space's link.
//
//   node scripts/import-workspace.ts examples/monoambiente [--id <id>] [--name <name>]
//
// FLOORPLAN_DATA picks the data folder (default storage/), like the servers.
import path from 'node:path'
import { parseArgs } from 'node:util'
import { NodeFileSystem, NodePath } from '@effect/platform-node'
import { Layer, ManagedRuntime } from 'effect'
import { ServerConfig } from '../server/config.ts'
import { Spaces } from '../server/storage.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { id: { type: 'string' }, name: { type: 'string' } },
})
if (positionals.length !== 1) {
  console.error('Usage: node scripts/import-workspace.ts <workspace folder> [--id <id>] [--name <name>]')
  process.exit(1)
}
const root = process.cwd()
const rt = ManagedRuntime.make(
  Layer.mergeAll(
    NodeFileSystem.layer,
    NodePath.layer,
    ServerConfig.layerFromValues({
      dataDir: process.env.FLOORPLAN_DATA ?? path.join(root, 'storage'),
      templatesDir: path.join(root, 'examples'),
    }),
  ),
)
const spaces = rt.runSync(Spaces)
const id = await rt.runPromise(
  spaces.importWorkspace(path.resolve(positionals[0]), { id: values.id, name: values.name }),
)
const { plans } = await rt.runPromise(spaces.space(id))
console.log(`Space ${id}: ${plans.map((p) => p.id).join(', ')}`)
console.log(`Open http://localhost:5173/?space=${id}`)
