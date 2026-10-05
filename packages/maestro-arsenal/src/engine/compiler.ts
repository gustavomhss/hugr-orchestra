// Maestro adaptation of TechLead a68e7af (Copyright 2026 HuGR Labs, Apache-2.0).
// TypeScript API replaces fail-open stdout scraping and temporary source-tree writes.
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type ts from "typescript";
import { type ArsenalContext } from "../contract.ts";
import { AcquisitionError, boundRoot, inside, physical } from "./acquisition.ts";
import { trustedAsset } from "./trusted-assets.ts";

export interface CompilerDiagnostic { code: number; message: string; file?: string; start?: number; length?: number }
export interface CompilerRequest {
  files: Record<string, string>;
  targetPath?: string;
  noUnusedLocals?: boolean;
  includeProject?: boolean;
}

export async function compile(request: CompilerRequest, context: ArsenalContext) {
  const root = await boundRoot(context);
  const asset = await Promise.resolve().then(() => trustedAsset("typescript")).catch((error: unknown) => {
    throw new AcquisitionError("COMPILER_UNAVAILABLE", error instanceof Error ? error.message : String(error));
  });
  const lib = asset.root;
  await context.authorize({ effect: "read", paths: [root], commands: [] });
  await context.authorize({ effect: "process", paths: [root], commands: [["typescript:compile", asset.entry, "--noEmit"].map((arg) => JSON.stringify(arg)).join(" ")] });
  const module: { default: typeof ts } = await import(pathToFileURL(asset.entry).href).catch((error: unknown) => {
    throw new AcquisitionError("COMPILER_UNAVAILABLE", error instanceof Error ? error.message : String(error));
  });
  const compiler = module.default;
  const virtual = new Map(await Promise.all(Object.entries(request.files).map(async ([path, source]) => {
    const candidate = resolve(context.directory, path);
    if (!inside(resolve(context.directory), candidate) && !inside(root, candidate)) throw new AcquisitionError("PATH_ESCAPE", path);
    await context.authorize({ effect: "read", paths: [candidate], commands: [] });
    return [await physical(candidate), source] as const;
  })));
  virtual.forEach((_, path) => {
    if (!inside(root, path)) throw new AcquisitionError("PATH_ESCAPE", path);
    if (existsSync(path) && !inside(root, realpathSync(path))) throw new AcquisitionError("PATH_ESCAPE", path);
  });
  const allowed = (path: string) => {
    if (!existsSync(path)) return inside(root, resolve(path)) || inside(lib, resolve(path));
    const actual = realpathSync(path);
    if (!inside(root, actual) && !inside(lib, actual)) throw new AcquisitionError("COMPILER_PATH_ESCAPE", path);
    return true;
  };
  const readFile = (path: string) => virtual.get(resolve(path)) ?? (allowed(path) ? compiler.sys.readFile(path) : undefined);
  const fileExists = (path: string) => virtual.has(resolve(path)) || (allowed(path) && compiler.sys.fileExists(path));
  const configPath = request.targetPath ? findTsconfig(dirname(await physical(resolve(context.directory, request.targetPath))), root, fileExists) : undefined;
  const config = configPath ? compiler.readConfigFile(configPath, readFile) : { config: {} };
  if (config.error) throw new AcquisitionError("COMPILER_CONFIG_FAILED", compiler.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = compiler.parseJsonConfigFileContent(config.config, {
    useCaseSensitiveFileNames: compiler.sys.useCaseSensitiveFileNames,
    fileExists, readFile,
    readDirectory(path, extensions, exclude, include, depth) {
      if (!allowed(path)) throw new AcquisitionError("COMPILER_PATH_ESCAPE", path);
      return compiler.sys.readDirectory(path, extensions, exclude, include, depth).map((file) => {
        allowed(file);
        return file;
      });
    },
  }, configPath ? dirname(configPath) : root, configPath ? undefined : {
    target: compiler.ScriptTarget.ES2020, module: compiler.ModuleKind.ESNext,
    moduleResolution: compiler.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true,
  }, configPath);
  // TS18003 is expected for virtual-only acquisition; all other config failures are real.
  const configErrors = parsed.errors.filter((error) => error.code !== 18003);
  if (configErrors.length) throw new AcquisitionError("COMPILER_CONFIG_FAILED", configErrors.map((error) => compiler.flattenDiagnosticMessageText(error.messageText, "\n")).join("\n"));
  const options: ts.CompilerOptions = {
    ...parsed.options, noEmit: true, incremental: false, composite: false,
    noUnusedLocals: request.noUnusedLocals ?? false, noUnusedParameters: false,
  };
  const host = compiler.createCompilerHost(options);
  host.readFile = readFile;
  host.fileExists = fileExists;
  host.getCurrentDirectory = () => root;
  host.directoryExists = (path) => {
    if ([...virtual.keys()].some((file) => inside(resolve(path), file))) return true;
    if (!inside(root, resolve(path)) && !inside(lib, resolve(path))) return false;
    return allowed(path) && compiler.sys.directoryExists(path);
  };
  host.realpath = (path) => virtual.has(resolve(path)) ? resolve(path) : allowed(path) && existsSync(path) ? realpathSync(path) : path;
  host.getSourceFile = (path, languageVersion) => {
    const source = readFile(path);
    return source === undefined ? undefined : compiler.createSourceFile(path, source, languageVersion, true);
  };
  host.writeFile = () => { throw new AcquisitionError("COMPILER_EMIT_FORBIDDEN", "noEmit boundary"); };
  const roots = [...new Set([...(request.includeProject && configPath ? parsed.fileNames : []), ...virtual.keys()])];
  if (!roots.length) throw new AcquisitionError("COMPILER_EMPTY_INPUT", "no compilation roots");
  const diagnostics = await Promise.resolve().then(() => compiler.getPreEmitDiagnostics(compiler.createProgram(roots, options, host))).catch((error: unknown) => {
    if (error instanceof AcquisitionError) throw error;
    throw new AcquisitionError("COMPILER_EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
  });
  if (!Array.isArray(diagnostics) || diagnostics.some((item) => !Number.isInteger(item.code) || item.messageText === undefined))
    throw new AcquisitionError("COMPILER_DIAGNOSTICS_MALFORMED", "structured diagnostics required");
  return {
    tsconfig: configPath ?? null,
    diagnostics: diagnostics.filter((item) => item.category === compiler.DiagnosticCategory.Error).map((item): CompilerDiagnostic => ({
      code: item.code, message: compiler.flattenDiagnosticMessageText(item.messageText, "\n"),
      file: item.file?.fileName, start: item.start, length: item.length,
    })),
  };
}

function findTsconfig(start: string, root: string, fileExists: (path: string) => boolean): string | undefined {
  if (!inside(root, start)) throw new AcquisitionError("PATH_ESCAPE", start);
  if (fileExists(join(start, "tsconfig.json"))) return join(start, "tsconfig.json");
  if (start === root) return undefined;
  return findTsconfig(dirname(start), root, fileExists);
}

export function diagnosticText(item: CompilerDiagnostic) {
  return `${item.file ?? "<config>"}: error TS${item.code}: ${item.message}`;
}

export function diagnosticKey(item: CompilerDiagnostic) { return `${item.code}:${item.message}`; }

export function missingName(item: CompilerDiagnostic): string | undefined {
  if ([2304, 2552, 2593].includes(item.code)) return /^Cannot find name '([^']+)'/.exec(item.message)?.[1];
  if (item.code === 2339) return /on type '([^']+)'/.exec(item.message)?.[1];
  if (item.code === 18004) return /shorthand property '([^']+)'/.exec(item.message)?.[1];
  return undefined;
}
