export type ClaudeAccount = { signedIn: boolean; email?: string; subscription?: string }

/** The three Claude Code sign-in routes of the server's providers group. */
export type ClaudeProviders = {
  claudeCodeAccount: () => Promise<ClaudeAccount>
  claudeCodeLogin: () => Promise<{ url: string }>
  claudeCodeLoginCode: (input: { code: string }) => Promise<boolean>
}

/** The binary's sign-in status, or undefined when the server cannot answer. */
export function readAccount(providers: ClaudeProviders) {
  return providers.claudeCodeAccount().catch(() => undefined)
}

/** Starts the sign-in. `url` is Claude Code's manual fallback; the CLI has already opened the browser itself. */
export function startSignIn(providers: ClaudeProviders) {
  return providers.claudeCodeLogin().then(
    (result) => ({ url: result.url }) as const,
    (error: unknown) => ({ error }) as const,
  )
}

/** Hands the pasted code to the running sign-in. A server with no running sign-in answers false, which is a failure. */
export function sendCode(providers: ClaudeProviders, code: string) {
  return providers.claudeCodeLoginCode({ code }).then(
    (delivered) => (delivered ? ({ delivered } as const) : ({ error: undefined } as const)),
    (error: unknown) => ({ error }) as const,
  )
}
