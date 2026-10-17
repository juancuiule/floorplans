import path from 'node:path'
import { Config, Context, Effect, Layer, Option } from 'effect'

// Everything the server needs to know about its environment: where people's
// spaces live (FLOORPLAN_DATA), where the template workspaces are (examples/),
// where the built app is (dist/) and what to listen on.
export class ServerConfig extends Context.Service<
  ServerConfig,
  {
    port: number
    host: string | undefined
    /** The data folder (FLOORPLAN_DATA): everyone's spaces. */
    dataDir: string
    /** Example workspaces offered as plan templates (examples/). */
    templatesDir: string
    /** The built SPA (dist/) — the production server falls back to it. */
    distDir: string
  }
>()('server/ServerConfig') {
  static readonly layer = Layer.effect(
    ServerConfig,
    Effect.gen(function* () {
      const port = yield* Config.Int('PORT').pipe(Config.withDefault(8080))
      const host = yield* Config.String('HOST').pipe(Config.option)
      const dataDir = yield* Config.String('FLOORPLAN_DATA').pipe(Config.withDefault('storage'))
      return ServerConfig.of({
        port,
        host: Option.getOrUndefined(host),
        dataDir: path.resolve(dataDir),
        templatesDir: path.resolve('examples'),
        distDir: path.resolve('dist'),
      })
    }),
  )

  /** A config from values, not the environment — for the dev server, tests and scripts. */
  static readonly layerFromValues = (values: { dataDir: string; templatesDir: string; distDir?: string }) =>
    Layer.succeed(
      ServerConfig,
      ServerConfig.of({
        port: 8080,
        host: undefined,
        dataDir: path.resolve(values.dataDir),
        templatesDir: path.resolve(values.templatesDir),
        distDir: path.resolve(values.distDir ?? 'dist'),
      }),
    )
}
