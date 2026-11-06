import { test } from "bun:test"
import { vectors } from "./fixture/msal"

Object.entries(vectors).forEach(([name, run]) => test(name, run))
