import "./httpapi-exercise/environment"
import { expect, test } from "bun:test"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Effect, Schema } from "effect"
import { main } from "./httpapi-exercise"
import { activityScenarios } from "./httpapi-exercise/activity"
import { callAuthProbe, makeApp } from "./httpapi-exercise/backend"

test("Docker effect exerciser runs the cached GET and explicit POST without a daemon", async () => {
  await Effect.runPromise(
    main(["--mode", "effect", "--include", "/api/activity/docker", "--fail-on-missing", "--fail-on-skip"]),
  )
})

test("Docker authenticated exercise probe uses the same daemon-free collector fixture", async () => {
  const scenario = activityScenarios.find((scenario) => scenario.path === "/api/activity/docker/read")
  if (!scenario || scenario.kind !== "active") throw new Error("Docker POST scenario missing")
  const app = makeApp({ auth: true })
  try {
    expect((await Effect.runPromise(callAuthProbe(app, scenario))).status).toBe(401)
    const before = await app.request("/api/activity/docker")
    expect(before.status).toBe(401)
    const authed = await Effect.runPromise(callAuthProbe(app, scenario, "valid"))
    expect(authed.status).toBe(200)
    expect(Schema.decodeUnknownSync(ActivityMonitor.DockerSnapshot)(authed.body)).toMatchObject({
      snapshotRevision: "1",
      attempt: { state: "complete" },
      inventory: { containers: [{ containerID: "exercise-container" }] },
    })
  } finally {
    await app.dispose()
  }
})
