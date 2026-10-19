import { expect, test } from "bun:test"
import { lstat, mkdir, readdir } from "node:fs/promises"
import { join } from "node:path"
import { admitArtifacts } from "../script/artifact-fs"
import { artifactFixture } from "./artifact-fs.test"

if (process.platform !== "darwin" || !process.env.ORCHESTRA_ARTIFACT_NATIVE_LANE?.startsWith("darwin-"))
  throw new Error("Darwin native case-insensitive artifact lane required")

test("Darwin actual case-insensitive existing and nonexistent suffix aliases reject overlap before writes", () =>
  artifactFixture(async (input) => {
    const lower = await lstat(input.dist, { bigint: true })
    // Deliberately fail, never skip, if the provisioned filesystem is case-sensitive.
    const upper = await lstat(join(input.root, "DIST"), { bigint: true })
    expect({ dev: upper.dev, ino: upper.ino }).toEqual({ dev: lower.dev, ino: lower.ino })
    await mkdir(join(input.dist, "existing"))
    const before = await readdir(input.dist)
    for (const suffix of ["existing/artifacts", "never-created/nested/artifacts", ""]) {
      await expect(
        admitArtifacts({ dist: input.dist, out: join(input.root, "DIST", suffix), targets: ["linux-arm64"] }),
      ).rejects.toThrow("Artifact source/output overlap")
      expect(await readdir(input.dist)).toEqual(before)
      expect(await readdir(join(input.dist, "existing"))).toEqual([])
    }
  }))
