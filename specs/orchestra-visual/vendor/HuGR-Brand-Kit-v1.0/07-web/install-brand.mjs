#!/usr/bin/env node
/** Usage: node install-brand.mjs ./public [--overwrite] */
import { cp, access, mkdir, readdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const args = process.argv.slice(2);
const overwrite = args.includes("--overwrite");
const targetArg = args.find(a => !a.startsWith("--"));
if (!targetArg || args.some(a => a.startsWith("--") && a !== "--overwrite")) {
  console.error("Usage: node install-brand.mjs <public-directory> [--overwrite]");
  process.exit(1);
}
const source = join(dirname(fileURLToPath(import.meta.url)), "brand");
const target = join(resolve(targetArg), "brand");
if (target === source || source.startsWith(target + "/") || target.startsWith(source + "/")) {
  throw new Error("Choose the public directory of your project, outside this source bundle.");
}
async function files(dir, prefix = "") {
  const result = [];
  for (const item of await readdir(dir, {withFileTypes: true})) {
    const relative = join(prefix, item.name);
    if (item.isDirectory()) result.push(...await files(join(dir,item.name),relative));
    else if (item.isFile()) result.push(relative);
  }
  return result;
}
const sourceFiles = await files(source);
const conflicts = [];
for (const file of sourceFiles) {
  try { await access(join(target,file)); conflicts.push(file); } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
if (conflicts.length && !overwrite) {
  console.error(`No files copied. ${conflicts.length} destination files already exist. Use --overwrite deliberately.`);
  process.exit(2);
}
await mkdir(target,{recursive:true});
await cp(source,target,{recursive:true,force:overwrite,errorOnExist:!overwrite});
console.log(`Copied ${sourceFiles.length} files to ${target}. Review head.html before merging metadata.`);
