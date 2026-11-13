export * as ReviewGit from "./git"

export const environment = Object.freeze({
  GIT_NO_REPLACE_OBJECTS: "1",
  GIT_NO_LAZY_FETCH: "1",
  GIT_ALLOW_PROTOCOL: "",
  GIT_TERMINAL_PROMPT: "0",
})
