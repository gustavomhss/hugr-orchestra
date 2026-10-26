// Invocations that never start a child process, so a binary without its omni addon still serves them.
// Every other command may spawn (the service daemon, shells, language servers) and needs the addon up front.
export function needsOmni(argv: readonly string[]) {
  if (argv.some((arg) => arg === "--version" || arg === "-v" || arg === "--help" || arg === "-h")) return false
  const words = argv.filter((arg) => !arg.startsWith("-"))
  return !(words[0] === "help" || (words[0] === "db" && words[1] === "path"))
}
