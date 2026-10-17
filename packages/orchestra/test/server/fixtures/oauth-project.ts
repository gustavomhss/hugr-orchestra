import path from "node:path"

// Keep admission inside the isolated project's source envelope and preserve the host Effect identity.
export const oauthProject = {
  git: true,
  config: { formatter: false as const, lsp: false as const, plugin: ["./oauth-compat.ts"] },
  init: async (directory: string) => {
    await Bun.write(
      path.join(directory, "oauth-compat.ts"),
      (await Bun.file(path.join(import.meta.dir, "oauth-compat.ts")).text()).replace(
        '"effect"',
        JSON.stringify(Bun.resolveSync("effect", import.meta.dir)),
      ),
    )
  },
}
