import { expect, test } from "bun:test"
import ts from "typescript"

const parse = async (file: string) => {
  const source = ts.createSourceFile(file, await Bun.file(new URL(`../../src/tool/${file}`, import.meta.url)).text(), ts.ScriptTarget.Latest, true)
  const calls: ts.CallExpression[] = []
  const variables: ts.VariableDeclaration[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) calls.push(node)
    if (ts.isVariableDeclaration(node)) variables.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  const named = (name: string, receiver?: string) =>
    calls.filter(
      (call) =>
        ts.isPropertyAccessExpression(call.expression) &&
        call.expression.name.text === name &&
        (receiver === undefined || call.expression.expression.getText(source) === receiver),
    )
  const variable = (name: string) => variables.find((item) => item.name.getText(source) === name)
  return { source, named, variable }
}

test("Task binds completion before actual background dispatch and checks actual worker result before completed return", async () => {
  const task = await parse("task.ts")
  const background = await parse("task-background.ts")
  const source = task.source
  const named = task.named
  // Task owns the dispatch order; TaskBackground.schedule owns the only actual background start.
  const dispatcher = task.variable("backgroundDispatch")
  if (dispatcher?.initializer?.getText(source).startsWith("yield* TaskBackground.make(") !== true)
    throw new Error("TASK_BACKGROUND_DISPATCHER_MISSING")
  const schedule = background.variable("schedule")
  const starts = background.named("start", "input.background")
  if (!schedule?.initializer || starts.length !== 1 || starts[0].pos < schedule.pos || starts[0].end > schedule.end)
    throw new Error("TASK_BACKGROUND_START_OUTSIDE_SCHEDULE")
  if (named("start").some((call) => ts.isPropertyAccessExpression(call.expression) && /background$/i.test(call.expression.expression.getText(source))))
    throw new Error("TASK_BACKGROUND_START_BYPASSES_SCHEDULE")
  const before = named("beforeDispatch")
  const finishes = named("verifiedCompletion")
  const dispatch = named("schedule", "backgroundDispatch")
  if (before.length !== 1 || finishes.length !== 2 || dispatch.length !== 1) throw new Error("TASK_COMPLETION_BOUNDARIES_MISSING_OR_DRIFTED")
  expect(before[0].pos).toBeLessThan(dispatch[0].pos)
  const run = task.variable("runTask")
  if (!run?.initializer) throw new Error("TASK_RUNNER_BOUNDARY_MISSING")
  const prompt = named("prompt").filter((call) => call.pos > run.pos && call.end < run.end)
  const check = finishes.filter((call) => call.pos > run.pos && call.end < run.end)
  if (prompt.length !== 1 || check.length !== 1) throw new Error("TASK_ACTUAL_RESULT_CHECK_MISSING")
  expect(check[0].pos).toBeGreaterThan(prompt[0].end)
  const returns: ts.ReturnStatement[] = []
  const findReturns = (node: ts.Node) => {
    if (ts.isReturnStatement(node)) returns.push(node)
    ts.forEachChild(node, findReturns)
  }
  findReturns(run.initializer)
  // The completed return may wrap the worker text in `work.report(...)` to append the qualification packet.
  const returned = (expression: ts.Expression | undefined) =>
    expression && ts.isCallExpression(expression) && expression.expression.getText(source) === "work.report"
      ? expression.arguments[0]
      : expression
  const result = returns.find((statement) => returned(statement.expression)?.getText(source).startsWith("result.parts.findLast"))
  if (!result) throw new Error("TASK_RESULT_RETURN_MISSING")
  expect(check[0].end).toBeLessThan(result.pos)
})
