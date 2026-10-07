interface ImportMetaEnv {
  readonly ORCHESTRA_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:orchestra-server" {
  export namespace Server {
    export const listen: typeof import("../../../orchestra/dist/types/src/node").Server.listen
    export type Listener = import("../../../orchestra/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../orchestra/dist/types/src/node").Config.get
    export type Info = import("../../../orchestra/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../orchestra/dist/types/src/node").bootstrap
}
