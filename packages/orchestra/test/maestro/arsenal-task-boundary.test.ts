import { expect, test } from "bun:test"
import ts from "typescript"

test("Task binds completion before actual background dispatch and checks actual worker result before completed return", async () => {
  const source = ts.createSourceFile("task.ts", await Bun.file(new URL("../../src/tool/task.ts", import.meta.url)).text(), ts.ScriptTarget.Latest, true)
  const calls: ts.CallExpression[] = []
  const variables: ts.VariableDeclaration[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) calls.push(node)
    if (ts.isVariableDeclaration(node)) variables.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  const named = (name: string) => calls.filter((call) => ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === name)
  const before = named("beforeDispatch")
  const finishes = named("verifiedCompletion")
  const dispatch = named("start").filter((call) => ts.isPropertyAccessExpression(call.expression) && call.expression.expression.getText(source) === "background")
  if (before.length !== 1 || finishes.length !== 2 || dispatch.length !== 1) throw new Error("TASK_COMPLETION_BOUNDARIES_MISSING_OR_DRIFTED")
  expect(before[0].pos).toBeLessThan(dispatch[0].pos)
  const run = variables.find((variable) => variable.name.getText(source) === "runTask")
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
  const result = returns.find((statement) => statement.expression?.getText(source).startsWith("result.parts.findLast"))
  if (!result) throw new Error("TASK_RESULT_RETURN_MISSING")
  expect(check[0].end).toBeLessThan(result.pos)
})
