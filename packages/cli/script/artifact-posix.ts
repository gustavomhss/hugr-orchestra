import { closeSync, fchmodSync, fstatSync, readSync, writeSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { artifactNativeError, artifactOwnedHandle, requireArtifactLeaf } from "./artifact-native"
import type { ArtifactDirectory, ArtifactNative } from "./artifact-native"

// Only libc signatures vary across the two POSIX adapters. Filesystem identity
// comes from fstat's bigint fields, never a guessed native struct layout.
// Integer operations return nonnegative success or per-call negative errno.
export type ArtifactPosixInput = {
  open(parent: number, name: string, flags: number, mode: number): number
  mkdir(parent: number, name: string): number
  unlink(parent: number, name: string, directory: boolean): number
  list(fd: number): string[]
  publish(parent: number, name: string, output: string): number
  flags: { root: number; directory: number; read: number; write: number }
  close(): void
}

export function artifactPosix(input: ArtifactPosixInput): ArtifactNative {
  const check = (value: number, operation: string) => {
    if (value >= 0) return value
    const errno = -value
    return artifactNativeError(operation, errno === 2 ? "ENOENT" : errno === 17 ? "EEXIST" : errno)
  }
  const identity = (fd: number) => {
    const stat = fstatSync(fd, { bigint: true })
    return `${stat.dev}:${stat.ino}`
  }
  const directory = (fd: number): ArtifactDirectory => {
    return artifactOwnedHandle(
      fd,
      (fd) => {
        if (!fstatSync(fd).isDirectory()) throw new Error("Artifact parent must be a nofollow directory")
        return { handle: BigInt(fd), identity: identity(fd) }
      },
      closeSync,
    )
  }
  const file = (parent: ArtifactDirectory, name: string) => {
    requireArtifactLeaf(name)
    const fd = check(input.open(Number(parent.handle), name, input.flags.read, 0), "open file")
    return artifactOwnedHandle(
      fd,
      (fd) => {
        if (!fstatSync(fd).isFile()) throw new Error("Artifact must be a confined regular file")
        return fd
      },
      closeSync,
    )
  }
  return {
    root: (path) => {
      if (path !== "/") throw new Error("Artifact POSIX root acquisition requires filesystem root")
      return directory(check(input.open(-1, path, input.flags.root, 0), "open root"))
    },
    directory: (parent, name, options = {}) => {
      requireArtifactLeaf(name)
      if (options.create) {
        const result = input.mkdir(Number(parent.handle), name)
        const errno = -result
        if (result < 0 && (options.exclusive || errno !== 17))
          artifactNativeError("mkdir", errno === 17 ? "EEXIST" : errno)
      }
      return directory(check(input.open(Number(parent.handle), name, input.flags.directory, 0), "open directory"))
    },
    read: (parent, name) => {
      const fd = file(parent, name)
      try {
        const chunks: Buffer[] = []
        const chunk = Buffer.alloc(64 * 1024)
        for (;;) {
          const count = readSync(fd, chunk, 0, chunk.length, null)
          if (!count) return { bytes: Buffer.concat(chunks), identity: identity(fd) }
          chunks.push(Buffer.from(chunk.subarray(0, count)))
        }
      } finally {
        closeSync(fd)
      }
    },
    fileIdentity: (parent, name) => {
      const fd = file(parent, name)
      try {
        return identity(fd)
      } finally {
        closeSync(fd)
      }
    },
    write: (parent, name, bytes, executable) => {
      requireArtifactLeaf(name)
      const fd = check(input.open(Number(parent.handle), name, input.flags.write, 0o600), "create file")
      try {
        if (!fstatSync(fd).isFile()) throw new Error("Artifact stage must be regular")
        for (let offset = 0; offset < bytes.length; ) {
          const count = writeSync(fd, bytes, offset, bytes.length - offset, null)
          if (!count) throw new Error("Artifact write made no progress")
          offset += count
        }
        fchmodSync(fd, executable ? 0o755 : 0o644)
      } finally {
        closeSync(fd)
      }
    },
    list: (directory) => input.list(Number(directory.handle)),
    publish: (parent, name, directory, output) => {
      requireArtifactLeaf(name)
      requireArtifactLeaf(output)
      // Stable, exclusively build-owned namespace; cooperating producers only.
      // Defense in depth, not source-name CAS: an authorized hostile actor can
      // replace this entry between the identity check and the native rename.
      const current = check(input.open(Number(parent.handle), name, input.flags.directory, 0), "reopen stage")
      try {
        if (identity(current) !== directory.identity) throw new Error("Artifact staging identity changed")
        check(input.publish(Number(parent.handle), name, output), "exclusive publication")
      } finally {
        closeSync(current)
      }
    },
    removeFile: (parent, name) => {
      requireArtifactLeaf(name)
      const result = input.unlink(Number(parent.handle), name, false)
      if (result < 0 && result !== -2) check(result, "unlink file")
    },
    removeDirectory: (parent, name, pinned) => {
      // Same controlled-build boundary. This precheck is not inode/name CAS
      // and cannot protect name-based unlink from an authorized hostile writer.
      const fd = input.open(Number(parent.handle), name, input.flags.directory, 0)
      if (fd === -2) return
      check(fd, "reopen cleanup directory")
      try {
        if (identity(fd) !== pinned.identity) throw new Error("Artifact cleanup directory identity changed")
        check(input.unlink(Number(parent.handle), name, true), "unlink directory")
      } finally {
        closeSync(fd)
      }
    },
    closeDirectory: (directory) => closeSync(Number(directory.handle)),
    close: input.close,
  }
}

// Never cross back into Bun between a libc failure and reading its thread-local
// errno. Bind every call AND errno accessor to the same selected runtime library.
export async function artifactPosixShim(library: string, sdk?: string) {
  const { cc } = await import("bun:ffi")
  const darwin = process.platform === "darwin"
  const suffix = darwin && process.arch === "x64" ? "$INODE64" : ""
  const directory = await mkdtemp(join(tmpdir(), "orchestra-artifact-ffi-"))
  const source = join(directory, "shim.c")
  const shim = await (async () => {
    await Bun.write(source, `
${darwin ? "#include <fcntl.h>\n#include <sys/types.h>\n#define ARTIFACT_MODE mode_t" : "#define ARTIFACT_MODE unsigned int"}
extern void *dlopen(const char *, int);
extern void *dlsym(void *, const char *);
extern int dlclose(void *);
static void *runtime;
static int *(*error_slot)(void);
static int (*call_open)(int, const char *, int, ...);
static int (*call_mkdir)(int, const char *, ARTIFACT_MODE);
static int (*call_unlink)(int, const char *, int);
static int (*call_dup)(int), (*call_close)(int), (*call_closedir)(void *);
static void *(*call_fdopendir)(int), *(*call_readdir)(void *);
static void (*call_rewinddir)(void *);
${darwin ? "static int (*call_publish)(int, const char *, int, const char *, unsigned int);" : "static long (*call_publish)(long, ...);"}
#define LOAD(target, name) target = dlsym(runtime, name); if (!target) { dlclose(runtime); runtime = 0; return -1; }
int artifact_bind(const char *library) {
  runtime = dlopen(library, 2); /* RTLD_NOW on both supported POSIX hosts. */
  if (!runtime) return -1;
  LOAD(error_slot, "${darwin ? "__error" : "__errno_location"}");
  LOAD(call_open, "openat"); LOAD(call_mkdir, "mkdirat"); LOAD(call_unlink, "unlinkat");
  LOAD(call_dup, "dup"); LOAD(call_close, "close"); LOAD(call_closedir, "closedir");
  LOAD(call_fdopendir, "fdopendir${suffix}"); LOAD(call_readdir, "readdir${suffix}"); LOAD(call_rewinddir, "rewinddir${suffix}");
  LOAD(call_publish, "${darwin ? "renameatx_np" : "syscall"}");
  return 0;
}
static int captured(int result) { return result < 0 ? -*error_slot() : result; }
int artifact_open(int parent, const char *name, int flags, unsigned int mode) {
  /* Fixed FFI signature; C emits Apple's ARM64 variadic mode stack argument. */
  return captured(call_open(parent, name, flags, (ARTIFACT_MODE)mode));
}
int artifact_mkdir(int parent, const char *name) { return captured(call_mkdir(parent, name, 0700)); }
int artifact_unlink(int parent, const char *name, int flags) { return captured(call_unlink(parent, name, flags)); }
int artifact_publish(int parent, const char *name, const char *output) {
  /* Linux UAPI x86_64=316, arm64/asm-generic=276; syscall consumes all six arguments. */
  ${darwin ? "return captured(call_publish(parent, name, parent, output, 4));" : `return captured((int)call_publish(${process.arch === "x64" ? 316 : 276}L, (long)parent, name, (long)parent, output, 1L, 0L));`}
}
int artifact_opendir(int fd, void **directory) {
  int duplicate = call_dup(fd);
  if (duplicate < 0) return -*error_slot();
  *directory = call_fdopendir(duplicate);
  if (!*directory) { int error = *error_slot(); call_close(duplicate); return -error; }
  call_rewinddir(*directory);
  return 0;
}
int artifact_readdir(void *directory, void **entry) {
  int *error = error_slot(); *error = 0;
  *entry = call_readdir(directory);
  return *entry ? 1 : -*error;
}
void artifact_closedir(void *directory) { call_closedir(directory); }
void artifact_release(void) { if (runtime) { dlclose(runtime); runtime = 0; } }
`)
    return cc({ source, include: sdk ? join(sdk, "usr/include") : undefined,
      define: darwin ? process.arch === "arm64" ? { __arm64__: "1" } : { __x86_64__: "1" } : undefined,
      symbols: {
        artifact_bind: { args: ["ptr"], returns: "i32" },
        artifact_open: { args: ["i32", "ptr", "i32", "u32"], returns: "i32" },
        artifact_mkdir: { args: ["i32", "ptr"], returns: "i32" },
        artifact_unlink: { args: ["i32", "ptr", "i32"], returns: "i32" },
        artifact_publish: { args: ["i32", "ptr", "ptr"], returns: "i32" },
        artifact_opendir: { args: ["i32", "ptr"], returns: "i32" },
        artifact_readdir: { args: ["ptr", "ptr"], returns: "i32" },
        artifact_closedir: { args: ["ptr"], returns: "void" }, artifact_release: { args: [], returns: "void" },
      } })
  })().then(async (compiled) => {
    await rm(directory, { recursive: true, force: true }).catch((error: unknown) => { compiled.close(); throw error })
    return compiled
  }, async (error: unknown) => { await rm(directory, { recursive: true, force: true }); throw error })
  if (shim.symbols.artifact_bind(Buffer.from(`${library}\0`)) !== 0) {
    shim.close()
    throw new Error(`Artifact POSIX runtime symbol binding failed: ${library}`)
  }
  const state = { closed: false }
  return { symbols: shim.symbols, close: () => {
    if (state.closed) return
    state.closed = true
    shim.symbols.artifact_release()
    shim.close()
  } }
}
