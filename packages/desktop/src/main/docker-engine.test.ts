import { expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import http from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { DockerEngine } from "./docker-engine"
import { rejection, rethrow } from "./rejection.fixture"

// Docker is reached through a named pipe (npipe://) on Windows, and Bun cannot serve HTTP on one there
// (listen fails with ENOENT on \\.\pipe\..., Bun 1.3.14), so this fixture covers the unix socket path only.
test.skipIf(process.platform === "win32")("uses a captured local socket, preserves status failures and bounds response size", async () => {
  const root = await mkdtemp(join(tmpdir(), "opencode-docker-api-"))
  const path = join(root, "local socket")
  const sockets = new Set<import("node:net").Socket>()
  const server = http.createServer((request, response) => {
    if (request.url === "/create" && request.method === "POST") {
      const chunks: Buffer[] = []
      request.on("data", (chunk: Buffer) => chunks.push(chunk))
      request.on("end", () => {
        response.writeHead(201, { "content-type": "application/json" })
        response.end(JSON.stringify({ received: JSON.parse(Buffer.concat(chunks).toString("utf8")) }))
      })
      return
    }
    if (request.url === "/empty" && ["POST", "DELETE"].includes(request.method ?? "")) {
      response.writeHead(204)
      response.end()
      return
    }
    if (request.url === "/held") return
    if (request.url === "/ok") {
      response.setHeader("content-type", "application/json")
      response.end(JSON.stringify({ socket: true }))
      return
    }
    if (request.url === "/missing") {
      response.writeHead(404, { "content-type": "application/json" })
      response.end(JSON.stringify({ message: "No such container: control" }))
      return
    }
    if (request.url === "/invalid") {
      response.end("{invalid-json")
      return
    }
    if (request.url === "/oversized") {
      response.end(JSON.stringify({ data: "x".repeat(2 * 1024 * 1024) }))
      return
    }
    response.writeHead(302, { location: "/ok" })
    response.end("redirect")
  })
  server.on("connection", socket => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
  })
  await new Promise<void>(resolve => server.listen(path, resolve))
  const engine = DockerEngine.create(`unix://${encodeURI(path)}`)
  try {
    expect(await engine.get("/ok")).toEqual({ socket: true })
    // A second actual response exercises the reusable socket path.
    expect(await engine.get("/ok")).toEqual({ socket: true })
    expect(await rejection(engine.get("/missing"))).toMatchObject({ status: 404 })
    expect(await rejection(engine.get("/invalid"))).toBeInstanceOf(SyntaxError)
    expect(await rethrow(engine.get("/oversized"))).toThrow("Docker API response exceeded the byte limit")
    expect(await rejection(engine.get("/redirect"))).toMatchObject({ status: 302 })
    expect(await engine.post("/create", { name: "owned helper", environment: ["LANG=C.UTF-8"] })).toEqual({ received: { name: "owned helper", environment: ["LANG=C.UTF-8"] } })
    expect(await engine.post("/empty")).toBeNull()
    expect(await engine.delete("/empty")).toBeNull()
    expect(await rejection(engine.post("/missing", {}))).toMatchObject({ status: 404 })
    expect(await rejection(engine.post("/redirect", {}))).toMatchObject({ status: 302 })
    expect(await rethrow(engine.post("/create", { value: "x".repeat(2 * 1024 * 1024) }))).toThrow("Docker API request exceeded the byte limit")
    expect(await rethrow(engine.post("/held", {}, 10))).toThrow("Docker API request timed out")
  } finally {
    engine.close()
    sockets.forEach(socket => socket.destroy())
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true })
  }
})

test.skipIf(process.env.APP_DOCK_RUNTIME_INTEGRATION !== "1")("conforms to the actual Docker API in both directions", async () => {
  const exec = promisify(execFile)
  const context = process.env.DOCKER_CONTEXT || (await exec("docker", ["context", "show"])).stdout.trim()
  const endpoint = JSON.parse((await exec("docker", ["context", "inspect", context])).stdout)[0].Endpoints.docker.Host as string
  const engine = DockerEngine.create(endpoint)
  try {
    expect((await engine.get<{ OSType: string }>("/info")).OSType).toBe("linux")
    const name = `orchestra-api-missing-${randomUUID()}`
    const error = await engine.get(`/containers/${name}/json`).catch(error => error)
    expect(error).toBeInstanceOf(DockerEngine.ResponseError)
    expect(error.status).toBe(404)
    expect(JSON.parse(error.body)).toEqual({ message: `No such container: ${name}` })
    const volume = await engine.get(`/volumes/${name}`).catch(error => error)
    expect(volume).toBeInstanceOf(DockerEngine.ResponseError)
    expect(volume.status).toBe(404)
    expect(JSON.parse(volume.body)).toEqual({ message: `get ${name}: no such volume` })
  } finally {
    engine.close()
  }
})
