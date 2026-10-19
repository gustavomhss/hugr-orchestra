import { Effect } from "effect"

export default {
  id: "test.oauth-compat",
  effect: (ctx: import("@orchestra/plugin/v2/effect").PluginContext) =>
    ctx.integration
      .transform((draft) => {
        for (const integrationID of ["compat-a", "compat-b"]) {
          draft.method.update({
            integrationID,
            method: { id: "code", type: "oauth", label: "Synthetic code" },
            authorize: () =>
              Effect.succeed({
                mode: "code" as const,
                url: "https://example.test/oauth",
                instructions: "Enter synthetic code",
                callback: (code: string) =>
                  code !== "ok"
                    ? Effect.fail(new Error("synthetic code rejected"))
                    : Effect.succeed({
                        type: "oauth" as const,
                        methodID: "code",
                        access: "synthetic-access",
                        refresh: "synthetic-refresh",
                        expires: Date.now() + 3600_000,
                      }),
              }),
          })
        }
      })
      .pipe(Effect.asVoid),
}
