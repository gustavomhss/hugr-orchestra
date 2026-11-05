// Append-only checkpoint transport: acknowledged means committed AND read back from GitHub.
import assert from "node:assert/strict"
import { gitBlob, validateIdentity } from "./checkpoint.mjs"

export const CHECKPOINT_BRANCH = "genesis-checkpoints"

// GITHUB_TOKEN has 1000 REST requests/hour/repository; content creation has a general 500/hour limit.
// Each acknowledgement uses one PUT plus one GET. Eight seconds leaves headroom under both limits.
// https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
export function checkpointDelay(previous, now) {
  assert(Number.isFinite(previous) && Number.isFinite(now) && now >= previous, "checkpoint: invalid pacing clock")
  return Math.max(0, Math.ceil(8000 - (now - previous)))
}

export function checkpointRemote({ repository, token, request = fetch }) {
  assert(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository), "checkpoint: invalid repository")
  assert(typeof token === "string" && token.length > 0, "checkpoint: missing remote credential")
  const api = async (path, options = {}) => {
    const response = await request(`https://api.github.com/repos/${repository}/${path}`, {
      ...options, signal: AbortSignal.timeout(90000), headers: {
        accept: "application/vnd.github+json", authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28", "content-type": "application/json",
      },
    })
    if (!response.ok) throw Object.assign(new Error("checkpoint: remote operation refused"), {
      name: "CheckpointRemoteError", method: options.method ?? "GET", status: response.status,
    })
    return response.json()
  }
  return {
    async initialize() {
      const response = await request(`https://api.github.com/repos/${repository}/git/ref/heads/${CHECKPOINT_BRANCH}`, {
        signal: AbortSignal.timeout(90000), headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      })
      if (response.ok) return
      assert.equal(response.status, 404, "checkpoint: branch discovery failed")
      const tree = await api("git/trees", { method: "POST", body: JSON.stringify({ tree: [{
        path: "README.md", mode: "100644", type: "blob", content: "# Genesis recovery checkpoints\n\nImmutable scanned recovery evidence, not publication authority.\n",
      }] }) })
      const commit = await api("git/commits", { method: "POST", body: JSON.stringify({
        message: "chore(atlas): initialize recovery checkpoint storage", tree: tree.sha, parents: [],
      }) })
      await api("git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${CHECKPOINT_BRANCH}`, sha: commit.sha }) })
    },
    async append(identity, sequence, bytes) {
      validateIdentity(identity)
      assert(Number.isSafeInteger(sequence) && sequence > 0 && sequence <= 99999999, "checkpoint: invalid append sequence")
      const path = `runs/${identity.run}-${identity.attempt}/${identity.mode}/${String(sequence).padStart(8, "0")}.json.gz`
      // No sha/overwrite argument: an existing path is a conflict, never replaced or silently reconciled.
      const result = await api(`contents/${path}`, { method: "PUT", body: JSON.stringify({
        message: `chore(atlas): checkpoint ${identity.run}-${identity.attempt} ${sequence}`,
        branch: CHECKPOINT_BRANCH, content: bytes.toString("base64"),
      }) })
      const expected = gitBlob(bytes)
      assert.equal(result.content?.sha, expected, "checkpoint: upload blob identity mismatch")
      assert(/^[0-9a-f]{40}$/.test(result.commit?.sha), "checkpoint: missing durable commit")
      const readback = await api(`git/blobs/${expected}`)
      assert.equal(readback.encoding, "base64", "checkpoint: unsupported remote encoding")
      assert.deepEqual(Buffer.from(readback.content, "base64"), bytes, "checkpoint: remote readback mismatch")
      return { path, blob: expected, commit: result.commit.sha }
    },
    async read(identity) {
      validateIdentity(identity)
      const tree = await api(`git/trees/${CHECKPOINT_BRANCH}?recursive=1`)
      assert(tree.truncated === false && Array.isArray(tree.tree), "checkpoint: incomplete remote inventory")
      const prefix = `runs/${identity.run}-${identity.attempt}/${identity.mode}/`
      const items = tree.tree.filter((item) => item.path.startsWith(prefix)).sort((a, b) => a.path.localeCompare(b.path))
      assert(items.length > 0 && items.every((item) => item.type === "blob" &&
        /^\d{8}\.json\.gz$/.test(item.path.slice(prefix.length))), "checkpoint: missing or invalid remote chain")
      const records = []
      for (const item of items) {
        const blob = await api(`git/blobs/${item.sha}`)
        assert.equal(blob.encoding, "base64", "checkpoint: unsupported remote encoding")
        const bytes = Buffer.from(blob.content, "base64")
        assert.equal(gitBlob(bytes), item.sha, "checkpoint: corrupt remote blob")
        records.push(bytes)
      }
      return records
    },
  }
}
