// Runs actual E authorizer/PermissionV2 and actual A strict registry read-only.
// B functions come from this worktree. All host data lives in the caller's fixture.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gitRead } from "../../src/tools/repo-hygiene-check.ts";
import { mapRepository } from "../../src/tools/repo-mapper.ts";
import { compile } from "../../src/engine/compiler.ts";
import { runProcess } from "../../src/engine/process.ts";
import { trustedAsset } from "../../src/engine/trusted-assets.ts";
import { extractSymbols } from "../../src/onboard/extract.ts";
import { acquisitionDescriptors } from "../../src/engine/descriptors.ts";
import { detectBriefUsage } from "../../src/engine/brief-usage.ts";

const root = process.env.MAESTRO_CONFORMANCE_ROOT;
const directory = process.env.MAESTRO_CONFORMANCE_DIRECTORY;
const stateDirectory = process.env.MAESTRO_CONFORMANCE_STATE;
assert.ok(root && directory && stateDirectory, "CONFORMANCE_HOST_REQUIRED");
const load = (file) => import(pathToFileURL(join(root, "packages/core/src", file)).href);
const { Effect, Layer } = createRequire(join(root, "packages/core/package.json"))("effect");
const { MaestroArsenal } = await load("tool/maestro-arsenal.ts");
const { FSUtil } = await load("fs-util.ts");
const { PermissionV2 } = await load("permission.ts");
const { PermissionSaved } = await load("permission/saved.ts");
const { AgentV2 } = await load("agent.ts");
const { Database } = await load("database/database.ts");
const { EventV2 } = await load("event.ts");
const { SessionStore } = await load("session/store.ts");
const { SessionV2 } = await load("session.ts");
const { SessionMessage } = await load("session/message.ts");
const { SessionTable } = await load("session/sql.ts");
const { ProjectTable } = await load("project/sql.ts");
const { Project } = await load("project.ts");
const { Location } = await load("location.ts");
const { Global } = await load("global.ts");
const { AbsolutePath } = await load("schema.ts");
const { AppNodeBuilder } = await load("effect/app-node-builder.ts");
const { LayerNode } = await load("effect/layer-node.ts");
const { Tool } = await load("tool/tool.ts");
const registry = await import(pathToFileURL(process.env.MAESTRO_BRIEF_ASSEMBLY
  ? join(process.env.MAESTRO_BRIEF_ASSEMBLY, "src/registry.ts")
  : join(root, "packages/maestro-arsenal/src/registry.ts")).href);
const projectID = Project.ID.make("arsenal-resource-conformance");
const sessionID = SessionV2.ID.make("ses_arsenal_resource");
const agentID = AgentV2.ID.make("maestro");
const layer = AppNodeBuilder.build(LayerNode.group([
  FSUtil.node, Global.node, Location.node, Database.node, EventV2.node,
  AgentV2.node, SessionStore.node, PermissionSaved.node, PermissionV2.node,
]), [
  [Database.node, Database.layerFromPath(":memory:")],
  [Location.node, Layer.succeed(Location.Service, Location.Service.of({
    directory: AbsolutePath.make(directory), project: { id: projectID, directory: AbsolutePath.make(directory) }, vcs: "git",
  }))],
  [Global.node, Global.layerWith({ data: stateDirectory })],
]);

const report = await Effect.runPromise(Effect.gen(function* () {
  const database = yield* Database.Service;
  const agents = yield* AgentV2.Service;
  const permission = yield* PermissionV2.Service;
  const filesystem = yield* FSUtil.Service;
  const services = yield* Effect.context();
  yield* database.db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).run();
  yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: projectID, slug: "resource", directory, title: "resource", version: "test", agent: agentID }).run();
  yield* agents.transform((editor) => editor.update(agentID, (agent) => {
    agent.permissions = [
      { action: "read", resource: "*", effect: "allow" },
      { action: "bash", resource: "*", effect: process.argv[2] === "deny" ? "deny" : "allow" },
    ];
  }));
  const actions = [];
  const requests = [];
  const host = {
    directory, stateDirectory,
    ask: (action, resources) => Effect.gen(function* () {
      actions.push({ action, resources });
      yield* permission.assert({ action, resources, sessionID, agent: agentID,
        source: { type: "tool", messageID: SessionMessage.ID.make("msg_arsenal_resource"), callID: "resource-conformance" },
      }).pipe(Effect.mapError(() => new Tool.Failure({ message: "Native bash/read permission denied" })));
    }),
  };
  const context = Object.freeze({ directory, stateDirectory, projectID,
    authorize: async (request) => {
      requests.push(request);
      const exit = await Effect.runPromiseExitWith(services)(MaestroArsenal.authorize(filesystem, host, request));
      if (exit._tag === "Failure") throw new Error("NATIVE_AUTH_DENIED");
    },
  });
  if (process.argv[2] === "brief") {
    const invoke = (input) => registry.execute("brief-usage-check", input, context);
    const decode = (result) => JSON.parse(result.content[0].text);
    const available = { exports: ["foo"], helpers: [], importNames: [] };
    const source = "export const foo: string = 123";
    const bad = yield* Effect.promise(() => invoke({ declared: ["foo"], source }));
    assert.notEqual(bad.isError, true);
    assert.equal(decode(bad).ok, false);
    assert.equal(decode(bad).backend, "typescript");
    assert.ok(decode(bad).diagnostics.some((line) => line.includes("TS2322")));
    assert.ok(requests.some((request) => request.effect === "process"));
    assert.ok(actions.some((action) => action.action === "bash"));
    const beforeGood = requests.length;
    const good = yield* Effect.promise(() => invoke({ declared: ["foo"], source: "export const foo: string = 'valid'" }));
    assert.notEqual(good.isError, true);
    assert.equal(decode(good).ok, true);
    assert.deepEqual(decode(good).diagnostics, []);
    assert.ok(requests.length > beforeGood);
    const invalid = [
      { declared: ["foo"], source, available: { exports: ["foo"] } },
      { declared: ["foo"], source, available },
      { declared: ["foo"] },
      { declared: ["foo"], available: {} },
      { declared: ["foo"], available: { exports: ["foo"] } },
      { declared: [], available: {} },
      { declared: [], available },
      { declared: ["foo"], available: { exports: [], helpers: [], importNames: [] } },
      { declared: ["foo"], available: { ...available, helpers: "foo" } },
      { declared: ["foo"], available: { ...available, importNames: [1] } },
      { declared: ["foo"], available: { ...available, exports: Array(1001).fill("foo") } },
      { declared: ["foo"], source: "" },
      { declared: ["foo"], source: "x".repeat(1000001) },
    ];
    for (const input of invalid) {
      const count = requests.length;
      const result = yield* Effect.promise(() => invoke(input));
      assert.equal(result.isError, true);
      assert.equal(decode(result).error, "invalid_arguments");
      assert.equal(requests.length, count, "invalid mode must not authorize any effect");
    }
    const beforeAvailable = requests.length;
    const pure = yield* Effect.promise(() => invoke({ declared: ["foo"], available }));
    assert.notEqual(pure.isError, true);
    assert.equal(decode(pure).ok, true);
    const helperOnly = yield* Effect.promise(() => invoke({ declared: ["helper"], available: { exports: [], helpers: ["helper"], importNames: [] } }));
    assert.equal(decode(helperOnly).ok, true);
    assert.equal(requests.length, beforeAvailable);
    for (const [input, code] of [
      [{ declared: ["foo"], source, available }, "BRIEF_MODE_CONFLICT"],
      [{ declared: ["foo"] }, "BRIEF_ACQUISITION_MISSING"],
      [{ declared: [], available }, "BRIEF_DECLARED_EMPTY"],
      [{ declared: ["foo"], available: { exports: ["foo"] } }, "BRIEF_AVAILABLE_INCOMPLETE"],
      [{ declared: ["foo"], available: { ...available, helpers: "foo" } }, "BRIEF_AVAILABLE_INVALID"],
      [{ declared: ["foo"], available: { exports: [], helpers: [], importNames: [] } }, "BRIEF_UNIVERSE_EMPTY"],
      [{ declared: ["foo"], source: undefined }, "BRIEF_SOURCE_INVALID"],
    ]) {
      const count = requests.length;
      yield* Effect.promise(() => assert.rejects(detectBriefUsage(input, context), new RegExp(code)));
      assert.equal(requests.length, count);
    }
    return { scenario: "brief", source: "actual TS2322 and clean source control", modes: "invalid_arguments before authorization", available: "complete nonempty universe", defense: "named handler failures" };
  }
  if (process.argv[2] === "allow") {
    const stdout = yield* Effect.promise(() => gitRead(directory, ["status", "--porcelain=v1", "-z"], context));
    assert.match(stdout, /target\.ts/);
    const bad = yield* Effect.promise(() => compile({ files: { "bad.ts": "export const x: number = 'bad'" } }, context));
    assert.ok(bad.diagnostics.some((item) => item.code === 2322));
    const good = yield* Effect.promise(() => compile({ files: { "good.ts": "export const x: number = 1" } }, context));
    assert.deepEqual(good.diagnostics, []);
    const parsed = yield* Effect.promise(() => extractSymbols("target.ts", "export const Symbol = 1", context));
    assert.equal(parsed.coverage.complete, true);
    assert.equal(parsed.symbols[0].name, "Symbol");
    assert.ok(actions.some((item) => item.action === "bash" && item.resources.some((command) => command.includes("status"))));
    assert.ok(actions.some((item) => item.action === "bash" && item.resources.some((command) => command.includes("typescript:compile"))));
    assert.ok(requests.every((request) => request.paths.every((path) => FSUtil.contains(directory, path) || FSUtil.contains(stateDirectory, path))));
    const compiler = trustedAsset("typescript");
    const parser = trustedAsset("parser-worker");
    assert.ok(Object.isFrozen(compiler) && Object.isFrozen(parser));
    assert.ok(requests.every((request) => !request.paths.includes(compiler.entry) && !request.paths.includes(compiler.root) && !request.paths.includes(parser.entry)));
    return { scenario: "allow", git: "actual status", compiler: "actual TS2322 and clean control", parser: "actual tree-sitter", permission: "actual E and PermissionV2" };
  }
  if (process.argv[2] === "deny") {
    const marker = join(directory, "process-marker");
    const argv = ["node", "-e", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'launched')`];
    const denied = yield* Effect.promise(() => runProcess(argv, directory, context).then(() => false, (error) => {
      assert.match(error.message, /NATIVE_AUTH_DENIED/);
      return true;
    }));
    assert.equal(yield* filesystem.exists(marker), false);
    assert.equal(denied, true);
    assert.ok(actions.some((item) => item.action === "bash"));
    return { scenario: "deny", permission: "actual PermissionV2 bash denial", sideEffect: "marker absent" };
  }
  assert.equal(process.argv[2], "inputs");
  const outside = join(directory, "..", "outside.ts");
  yield* Effect.promise(() => assert.rejects(context.authorize({ effect: "read", paths: [outside], commands: [] }), /NATIVE_AUTH_DENIED/));
  yield* Effect.promise(() => assert.rejects(mapRepository({ root: join(directory, "..") }, context), /ROOT_MISMATCH/));
  yield* Effect.promise(() => assert.rejects(compile({ files: { [outside]: "export const escape = 1" } }, context), /PATH_ESCAPE/));
  for (const declared of Object.values(acquisitionDescriptors)) {
    const descriptor = yield* Effect.promise(() => registry.describe(declared.name));
    assert.deepEqual(descriptor.inputSchema, declared.inputSchema);
    assert.deepEqual(descriptor.effects, declared.effects);
  }
  const count = requests.length;
  const invalid = yield* Effect.promise(() => registry.execute("decompose", { targetPath: "target.ts", k: 2, tscPath: outside }, context));
  assert.equal(invalid.isError, true);
  const error = JSON.parse(invalid.content[0].text);
  assert.equal(error.error, "invalid_arguments");
  assert.match(error.message, /tscPath.*unknown field/);
  assert.equal(requests.length, count);
  const valid = yield* Effect.promise(() => registry.execute("brief-usage-check", { declared: ["A"], available: { exports: ["A"], helpers: [], importNames: [] } }, context));
  assert.notEqual(valid.isError, true);
  assert.equal(JSON.parse(valid.content[0].text).ok, true);
  return { scenario: "inputs", data: "external data rejected by actual E/B", schema: "actual A unknown tscPath rejected before authorization", control: "valid strict input executed" };
}).pipe(Effect.scoped, Effect.provide(layer)));
process.stdout.write(JSON.stringify(report));
