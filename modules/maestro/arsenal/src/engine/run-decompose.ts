// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type Plan } from "../plan.ts";
import { createHash } from "node:crypto";
import { type ArsenalContext } from "../contract.ts";
import { runWave } from "./run-wave.ts";
import { assessDecomposability } from "./assess-decomposability.ts";
import { repairImports } from "./repair.ts";
import { diagnoseRed } from "./diagnose-red.ts";
import { verifyInProject } from "./verify-in-project.ts";
import { blocks } from "./text.ts";
import { AcquisitionError, projectPath, requireContext } from "./acquisition.ts";

export interface RunDecomposeOptions { targetPath: string; k: number; materialize?: { directory: string } }
export async function runDecompose(opts: RunDecomposeOptions, supplied?: ArsenalContext) {
  const context = requireContext(supplied);
  if (!Number.isInteger(opts.k) || opts.k < 1 || opts.k > 100) throw new AcquisitionError("PARTITION_COUNT_INVALID", "k must be an integer between 1 and 100");
  const target = await projectPath(context, opts.targetPath);
  if (Bun.file(target).size > 1_000_000) throw new AcquisitionError("DECOMPOSE_SOURCE_CAP", "target exceeds 1MB");
  const source = await Bun.file(target).text();
  const assessment = assessDecomposability(source);
  if (!assessment.decomposable) {
    const plan: Plan = { baselineSha: "0", target, modules: [], frozenSurface: [], edges: [], relocations: [], conservation: { totalSymbols: assessment.symbolCount, totalExports: 0, perModule: {} }, cycles: [], ok: false, issues: [assessment.reason], hash: "00000000" };
    return { plan, verified: false, mode: "REFUSED" as const, diagnosis: { kind: "LIMIT", reason: assessment.reason } };
  }
  // Regex block mover is deliberately bounded. AST detects unsupported top-level syntax
  // before it could be dropped or misreported as a surface-preserving transform.
  await context.authorize({ effect: "process", paths: [target], commands: ["typescript:parse source coverage"] });
  const { default: compiler } = await import("typescript");
  const ast = compiler.createSourceFile(target, source, compiler.ScriptTarget.Latest, true);
  const parsed = blocks(source);
  ast.statements.forEach((statement) => {
    if (compiler.isImportDeclaration(statement)) return;
    if (compiler.isVariableStatement(statement) && (statement.declarationList.declarations.length !== 1 || !compiler.isIdentifier(statement.declarationList.declarations[0].name)))
      throw new AcquisitionError("DECOMPOSE_UNSUPPORTED_SYNTAX", "multi-binding/destructured declarations need AST relocation");
    const text = statement.getText(ast);
    if (!parsed.some((block) => block.content.startsWith(text)) && !parsed.some((block) => text.startsWith(block.content)))
      throw new AcquisitionError("DECOMPOSE_UNSUPPORTED_SYNTAX", `top-level ${compiler.SyntaxKind[statement.kind]} at ${ast.getLineAndCharacterOfPosition(statement.getStart(ast)).line + 1}`);
  });
  const declaredNames = new Set(ast.statements.flatMap((statement) => {
    if (compiler.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap((declaration) => compiler.isIdentifier(declaration.name) ? [declaration.name.text] : []);
    if (compiler.isFunctionDeclaration(statement) || compiler.isClassDeclaration(statement) || compiler.isInterfaceDeclaration(statement) || compiler.isTypeAliasDeclaration(statement) || compiler.isEnumDeclaration(statement)) return statement.name ? [statement.name.text] : [];
    return [];
  }));
  if (parsed.some((block) => !declaredNames.has(block.name))) throw new AcquisitionError("DECOMPOSE_UNSUPPORTED_SYNTAX", "block names must exactly match AST top-level declarations");
  const wave = await runWave({ source, k: opts.k, target, baselineSha: createHash("sha256").update(source).digest("hex") }, context);
  const state = { files: wave.files, verification: wave.verification, repairs: 0 };
  while (!state.verification.ok && state.verification.missing.length && state.repairs < 3) {
    const repair = repairImports(state.files, "barrel", state.verification.missing, parsed.map((block) => block.name));
    if (!repair.added && !repair.moved) break;
    state.files = repair.files;
    state.repairs++;
    state.verification = await verifyInProject({ godfilePath: target, files: state.files, barrelName: "barrel", baseline: wave.baseline.diagnostics }, context);
  }
  const verified = wave.plan.ok && state.verification.ok;
  const diagnosis = verified ? undefined : diagnoseRed(source, state.verification.errors, state.verification.missing) ?? { kind: "TRACKED", reason: wave.plan.issues.join("; ") };
  if (await Bun.file(await projectPath(context, target)).text() !== source) throw new AcquisitionError("DECOMPOSE_SOURCE_CHANGED", "source changed during compiler acquisition");
  if (opts.materialize) {
    if (!verified) throw new AcquisitionError("MATERIALIZATION_UNVERIFIED", "verified artifacts required");
    const output = await projectPath(context, opts.materialize.directory, "write");
    // Explicit destination only; exclusive writes prevent automatic in-place overwrite.
    const { mkdir, writeFile, lstat } = await import("node:fs/promises");
    const paths = [...state.files.modules.map((module) => ({ path: `${output}/${module.id}.ts`, content: module.content })), { path: `${output}/barrel.ts`, content: state.files.barrel }];
    for (const file of paths) {
      await projectPath(context, file.path, "write");
      const exists = await lstat(file.path).then(() => true, (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return false;
      });
      if (exists) throw new AcquisitionError("MATERIALIZATION_COLLISION", file.path);
    }
    await mkdir(output, { recursive: true });
    for (const file of paths) await writeFile(file.path, file.content, { flag: "wx" });
  }
  return { plan: wave.plan, verified, mode: verified ? "GREEN" as const : diagnosis?.kind === "LIMIT" ? "REFUSED" as const : "RED" as const,
    diagnosis, files: state.files, label: `${state.verification.tsconfig ? "in-project" : "isolated"}, ${state.repairs} repair(s)`, errors: state.verification.errors };
}
