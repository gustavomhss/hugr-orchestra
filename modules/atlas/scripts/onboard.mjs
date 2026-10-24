#!/usr/bin/env node

// Atlas Onboarding Script
// Automates: install (atlas init) -> index (doctor index, mine, promote) -> catalog (own-export + materialize)

import { execFileSync, execSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = process.cwd()
const ATLAS_BIN = join(ROOT, "modules", "atlas", "packages", "cli", "dist", "cli.js")

function fail(message) {
  console.error(`atlas-onboard: ${message}`)
  process.exit(1)
}

function run(cmd, args, options = {}) {
  const fullCmd = [cmd, ...args].join(" ")
  console.log(`$ ${fullCmd}`)
  try {
    return execFileSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...options })
  } catch (error) {
    const message = error.stdout?.toString() || error.stderr?.toString() || error.message
    fail(`${fullCmd} failed: ${message}`)
  }
}

function runCapture(cmd, args, options = {}) {
  const fullCmd = [cmd, ...args].join(" ")
  console.log(`$ ${fullCmd}`)
  try {
    return execFileSync(cmd, args, { encoding: "utf8", cwd: ROOT, ...options }).trim()
  } catch (error) {
    const message = error.stdout?.toString() || error.stderr?.toString() || error.message
    fail(`${fullCmd} failed: ${message}`)
  }
}

function checkAtlasBin() {
  if (!existsSync(ATLAS_BIN)) {
    fail(`Atlas CLI not built at ${ATLAS_BIN}. Run 'npm run build' in modules/atlas first.`)
  }
}

function runAtlasInit() {
  console.log("\n=== Step 1: Install (atlas init) ===")
  run("node", [ATLAS_BIN, "init"])
  console.log("✓ Install complete")
}

function runAtlasDoctorIndex() {
  console.log("\n=== Step 2a: Index Diagnosis (atlas doctor index) ===")
  run("node", [ATLAS_BIN, "doctor", "index"])
}

function runAtlasMine() {
  console.log("\n=== Step 2b: Mining (atlas mine) ===")
  // Use default mining (all arms)
  run("node", [ATLAS_BIN, "mine"])
}

function runAtlasPromote() {
  console.log("\n=== Step 2c: Promotion (atlas promote) ===")
  run("node", [ATLAS_BIN, "promote"])
}

function runAtlasOwnExport() {
  console.log("\n=== Step 3a: Catalog Export (atlas own-export) ===")
  const tempSnapshot = join(dirname(process.cwd()), `.own-snapshot-${Date.now()}.json`)
  const units = process.argv.slice(2).filter((arg) => !arg.startsWith("--"))
  const unitArgs = units.length > 0 ? units : ["."]
  
  run("node", [ATLAS_BIN, "own-export", ...unitArgs, "--out", tempSnapshot])
  return tempSnapshot
}

function runMaterialize(snapshotPath) {
  console.log("\n=== Step 3b: Materialize (materialize-own-snapshot) ===")
  const materializeScript = join(dirname(process.argv[1]), "..", "..", "scripts", "materialize-own-snapshot.mjs")
  run("node", [materializeScript, snapshotPath])
}

function verifyCatalog() {
  console.log("\n=== Step 4: Verify Catalog ===")
  const catalogPath = resolve(process.cwd(), "TERRITORY-CATALOG.json")
  const snapshotPath = resolve(process.cwd(), "OWN-SNAPSHOT.json")
  
  if (!existsSync(catalogPath)) {
    console.warn("Warning: TERRITORY-CATALOG.json not found")
    return false
  }
  if (!existsSync(snapshotPath)) {
    console.warn("Warning: OWN-SNAPSHOT.json not found")
    return false
  }
  
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"))
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"))
  
  console.log(`✓ TERRITORY-CATALOG.json: ${catalog.territories?.length || 0} territories`)
  console.log(`✓ OWN-SNAPSHOT.json: ${snapshot.units?.length || 0} units, rev ${snapshot.sourceRevision?.slice(0, 8)}`)
  return true
}

async function main() {
  console.log("=== Atlas Onboarding ===")
  console.log(`Repository: ${process.cwd()}`)
  
  checkAtlasBin()
  
  // Step 1: Install
  runAtlasInit()
  
  // Step 2: Index
  runAtlasDoctorIndex()
  runAtlasMine()
  runAtlasPromote()
  
  // Step 3: Catalog
  const snapshotPath = runAtlasOwnExport()
  runMaterialize(snapshotPath)
  
  // Step 4: Verify
  if (!verifyCatalog()) {
    console.warn("Warning: Catalog verification incomplete")
  }
  
  console.log("\n=== Onboarding Complete ===")
  console.log("Atlas is now ready. Maestro can now use 'atlas_context catalog' to read the catalog.")
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`onboard: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}