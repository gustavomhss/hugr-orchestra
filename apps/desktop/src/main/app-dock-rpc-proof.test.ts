import { expect, test } from "bun:test"
import { requireRPCProof } from "./app-dock-rpc-proof"

const required = ["R03", "M01"]
const complete = () => ({ version: 1, electronVersion: "42.3.3", cases: required.map((id) => ({ id, status: "pass" })) })

test("RPC proof accepts a complete real-shape report", () => {
  expect(() => requireRPCProof(complete(), required)).not.toThrow()
})

test("RPC proof rejects a reported failure even when every case passed", () => {
  expect(() => requireRPCProof({ ...complete(), error: "ENOENT: proof receipt write failed" }, required))
    .toThrow("rpc-proof-artifact-reported-error")
})

test("RPC proof rejects missing, failed, duplicated and empty cases", () => {
  const reports = [
    { ...complete(), cases: [] },
    { ...complete(), cases: [{ id: "R03", status: "pass" }] },
    { ...complete(), cases: [{ id: "R03", status: "pass" }, { id: "R03", status: "pass" }] },
    { ...complete(), cases: [{ id: "R03", status: "pass" }, { id: "M01", status: "fail" }] },
  ]
  reports.forEach((report) => expect(() => requireRPCProof(report, required)).toThrow("rpc-proof-required-case-missing-or-failed"))
  expect(() => requireRPCProof(complete(), [])).toThrow("rpc-proof-requirements-invalid")
})

test("RPC proof rejects malformed artifact metadata", () => {
  [null, {}, { ...complete(), version: 0 }, { ...complete(), electronVersion: "" }, { ...complete(), cases: null }]
    .forEach((report) => expect(() => requireRPCProof(report, required)).toThrow("rpc-proof-artifact-invalid"))
})
