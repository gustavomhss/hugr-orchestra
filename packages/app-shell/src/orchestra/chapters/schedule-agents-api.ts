import { Orchestra } from "@orchestra/client"
import { CapabilityScheduleManagement } from "@orchestra/schema/capability-schedule-management"
import { Schema } from "effect"
import type { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"
import type { Api, Options } from "./schedule-agents-model"

/** Selected-host transport for the agent schedules section; every route names the open directory. */
export function createScheduleAgentsApi(input: { server: ServerConnection.HttpBase; directory: string;
  fetch?: typeof globalThis.fetch }): Api {
  const location = Object.freeze({ directory: input.directory })
  const client = Orchestra.make({ baseUrl: input.server.url, fetch: input.fetch,
    headers: input.server.password ? { Authorization: `Basic ${authTokenFromCredentials({ username: input.server.username,
      password: input.server.password })}` } : undefined })
  const request = (options?: Options) => ({ signal: options?.signal })
  const schedule = Schema.decodeUnknownSync(CapabilityScheduleManagement.Schedule)
  return Object.freeze({
    list: (options) => client.capabilitySchedules.list({ location }, request(options))
      .then(Schema.decodeUnknownSync(CapabilityScheduleManagement.Page)),
    pause: (scheduleID, key, options) =>
      client.capabilitySchedules.pause({ location, scheduleID, "idempotency-key": key }, request(options)).then(schedule),
    resume: (scheduleID, key, options) =>
      client.capabilitySchedules.resume({ location, scheduleID, "idempotency-key": key }, request(options)).then(schedule),
    run: (scheduleID, key, options) => client.capabilitySchedules.run({ location, scheduleID, "idempotency-key": key },
      request(options)).then(Schema.decodeUnknownSync(CapabilityScheduleManagement.Started)),
    remove: (scheduleID, key, options) => client.capabilitySchedules.remove({ location, scheduleID, "idempotency-key": key },
      request(options)).then(Schema.decodeUnknownSync(CapabilityScheduleManagement.Removed)),
  } satisfies Api)
}
