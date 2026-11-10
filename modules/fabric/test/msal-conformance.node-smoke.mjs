import { test } from "node:test"
import { vectors } from "./fixture/msal.ts"

Object.entries(vectors).forEach(([name, run]) => test(name, run))
