import { test } from "bun:test"
import { Effect } from "effect"
import { main } from "./httpapi-exercise"

test("rag studio http exercise covers a named embedding model", async () => {
  await Effect.runPromise(main(["--mode", "effect", "--include", "/api/rag-studio", "--fail-on-skip"]))
})
