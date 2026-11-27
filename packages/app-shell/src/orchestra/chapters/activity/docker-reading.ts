import type { Orchestra } from "@orchestra/client"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Schema } from "effect"
import { createStore, reconcile } from "solid-js/store"
import { sampleAnchor } from "./reading"

type Operation = "cache" | "read"

type Flight = {
  controller: AbortController
  revision: string | undefined
  promise: Promise<void>
}

const decode = Schema.decodeUnknownSync(ActivityMonitor.DockerSnapshot)
const idle = () => ({ busy: false, failed: false })
const unread = () => ({
  snapshot: undefined as ActivityMonitor.DockerSnapshot | undefined,
  inventoryAnchor: undefined as number | undefined,
  attemptAnchor: undefined as number | undefined,
  cache: idle(),
  read: idle(),
})

export function createDockerReading(input: {
  api: Pick<ReturnType<typeof Orchestra.make>["activity"], "docker" | "readDocker">
  ready: Promise<void>
}) {
  const [state, setState] = createStore({ ...unread(), now: performance.now(), awaitingCache: false })
  const pending = new Map<Operation, Flight>()
  let disposed = false

  function abortPending() {
    const flights = [...pending.values()]
    pending.clear()
    flights.forEach((flight) => flight.controller.abort())
  }

  async function execute(operation: Operation, flight: Flight) {
    try {
      if (pending.get(operation) !== flight) return
      await input.ready
      flight.controller.signal.throwIfAborted()
      const options = { signal: flight.controller.signal }
      const response = await (operation === "cache" ? input.api.docker(options) : input.api.readDocker(options))
      if (pending.get(operation) !== flight) return

      const snapshot = decode(response)
      const previous = state.snapshot
      if (previous && previous.instanceID !== snapshot.instanceID) {
        // Only a fresh cache GET can establish the replacement instance.
        abortPending()
        setState({ ...unread(), awaitingCache: true })
        await start("cache")
        return
      }
      if (previous && BigInt(snapshot.snapshotRevision) <= BigInt(previous.snapshotRevision)) return

      const now = Math.max(state.now, performance.now())
      const clock = { readAt: snapshot.readAt, receivedAt: now }
      const inventoryAnchor = sampleAnchor(snapshot.inventory, previous?.inventory, state.inventoryAnchor, clock)
      const attemptAnchor = sampleAnchor(snapshot.attempt, previous?.attempt, state.attemptAnchor, clock)
      setState((current) => ({
        snapshot: current.snapshot ? reconcile(snapshot, { key: "containerID" })(current.snapshot) : snapshot,
        inventoryAnchor,
        attemptAnchor,
        now,
        awaitingCache: false,
      }))
    } catch (error) {
      if (pending.get(operation) !== flight) return
      if (operation === "cache" && flight.revision !== state.snapshot?.snapshotRevision) return
      console.error("[activity] Docker inventory request failed", error)
      setState(operation, "failed", true)
    } finally {
      if (pending.get(operation) === flight) {
        pending.delete(operation)
        setState(operation, "busy", false)
      }
    }
  }

  function start(operation: Operation) {
    if (disposed || (operation === "read" && state.awaitingCache)) return Promise.resolve()
    const active = pending.get(operation)
    if (active) return active.promise
    const flight: Flight = {
      controller: new AbortController(),
      revision: state.snapshot?.snapshotRevision,
      promise: Promise.resolve().then(() => execute(operation, flight)),
    }
    pending.set(operation, flight)
    setState(operation, { busy: true, failed: false })
    return flight.promise
  }

  return {
    state,
    refresh: () => start("cache"),
    read: () => start("read"),
    tick() {
      setState("now", Math.max(state.now, performance.now()))
    },
    dispose() {
      disposed = true
      abortPending()
    },
  }
}
