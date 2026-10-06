export * as LinuxWorkspaceFiles from "./linux-workspace-files"

import type { LinuxWorkspaceAccess } from "./linux-workspace-access"

export function create(access: ReturnType<typeof LinuxWorkspaceAccess.create>) {
  const execute = async (code: string, args: string[], stdin?: string, signal?: AbortSignal) => {
    const result = await access.run({ argv: ["python3", "-c", code, ...args], stdin }, { signal })
    if (result.exitCode !== 0 || result.cancelled || result.timedOut || result.truncated)
      throw new Error("workspace-file-operation-failed")
    return JSON.parse(result.stdout) as unknown
  }
  return {
    read(path: string, offset = 0, length = 65536, encoding: "utf8" | "base64" = "utf8", signal?: AbortSignal) {
      requirePath(path)
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(length) ||
        length < 1 ||
        length > 65536 ||
        !["utf8", "base64"].includes(encoding)
      )
        throw new Error("invalid-read")
      return execute(
        `import base64,json,os,sys
with open(sys.argv[1],'rb') as f:
 f.seek(int(sys.argv[2])); b=f.read(int(sys.argv[3])); size=os.fstat(f.fileno()).st_size
print(json.dumps({'data':base64.b64encode(b).decode() if sys.argv[4]=='base64' else b.decode('utf-8',errors='replace'),'encoding':sys.argv[4],'offset':int(sys.argv[2]),'nextOffset':int(sys.argv[2])+len(b),'size':size,'eof':int(sys.argv[2])+len(b)>=size}))`,
        [path, String(offset), String(length), encoding],
        undefined,
        signal,
      )
    },
    write(path: string, data: string, encoding: "utf8" | "base64" = "utf8", signal?: AbortSignal) {
      requirePath(path)
      if (typeof data !== "string" || Buffer.byteLength(data) > 1024 * 1024 || !["utf8", "base64"].includes(encoding))
        throw new Error("invalid-write")
      if (encoding === "base64" && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))
        throw new Error("invalid-base64")
      return execute(
        `import base64,json,sys
b=sys.stdin.buffer.read(); b=base64.b64decode(b,validate=True) if sys.argv[2]=='base64' else b
with open(sys.argv[1],'wb') as f: f.write(b)
print(json.dumps({'written':len(b)}))`,
        [path, encoding],
        data,
        signal,
      )
    },
    list(path = "/home/dock", offset = 0, length = 100, signal?: AbortSignal) {
      requirePath(path)
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 1000)
        throw new Error("invalid-list")
      return execute(
        `import itertools,json,os,sys
offset=int(sys.argv[2]); length=int(sys.argv[3])
with os.scandir(sys.argv[1]) as iterator:
 entries=list(itertools.islice(iterator,offset,offset+length+1))
print(json.dumps({'entries':[{'name':e.name,'directory':e.is_dir(follow_symlinks=False),'symlink':e.is_symlink()} for e in entries[:length]],'nextOffset':offset+min(length,len(entries)),'eof':len(entries)<=length}))`,
        [path, String(offset), String(length)],
        undefined,
        signal,
      )
    },
  }
}

function requirePath(path: string) {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("\0") || path.length > 8192)
    throw new Error("invalid-linux-path")
}
