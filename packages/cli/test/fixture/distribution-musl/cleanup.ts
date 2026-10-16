export type MuslContainerLease = { id: string; name: string; label: string; nonce: string }

// A creation-validated Docker ID is immutable and never recycled. Keep that
// lease independent of census success. Newly discovered IDs require their own
// name/label check; no failed census can authorize deletion of an unknown ID.
export async function removeOwnedMuslContainers(input: {
  scope: Omit<MuslContainerLease, "id">; known?: MuslContainerLease;
  run: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
  prepare?: (ids: string[]) => Promise<void>;
  censusFormat?: string;
}) {
  const failures: Error[] = []
  const owned = new Set<string>()
  if (input.known) {
    if (!/^[a-f0-9]{64}$/.test(input.known.id) || input.known.name !== input.scope.name ||
        input.known.label !== input.scope.label || input.known.nonce !== input.scope.nonce)
      throw new Error("MUSL_KNOWN_CONTAINER_LEASE_INVALID")
    owned.add(input.known.id)
  }
  const checked = async (args: string[]) => {
    const result = await input.run(args)
    if (result.code !== 0) throw new Error(`MUSL_DOCKER_OPERATION_FAILED: ${args.join(" ")}`, { cause: result })
    return result.stdout.trim()
  }
  const census = async () => {
    const output = await checked(["ps", "--all", "--no-trunc", "--filter", `label=${input.scope.label}=${input.scope.nonce}`,
      "--format", input.censusFormat ?? "{{.ID}}"])
    const ids = output ? output.split("\n").sort() : []
    if (ids.some((id) => !/^[a-f0-9]{64}$/.test(id))) throw new Error("MUSL_CONTAINER_ENUMERATION_INVALID")
    return ids
  }
  await census().then(async (ids) => {
    if (ids.length > 1 || (input.known && ids.some((id) => id !== input.known!.id)))
      failures.push(new Error("MUSL_CONTAINER_OWNERSHIP_CHANGED"))
    for (const id of ids) {
      if (owned.has(id)) continue
      await checked(["inspect", "--format", `{{.Id}}|{{.Name}}|{{index .Config.Labels "${input.scope.label}"}}`, id]).then((identity) => {
        if (identity !== `${id}|/${input.scope.name}|${input.scope.nonce}`)
          throw new Error(`MUSL_UNKNOWN_CONTAINER_IDENTITY_MISMATCH: ${id}`)
        owned.add(id)
      }).catch((cause: unknown) => { failures.push(new Error(`MUSL_DISCOVERED_CONTAINER_NOT_OWNED: ${id}`, { cause })) })
    }
  }).catch((cause: unknown) => { failures.push(new Error("MUSL_CONTAINER_CENSUS_FAILED", { cause })) })
  const retired: string[] = []
  try {
    await input.prepare?.([...owned])
  } catch (cause) {
    failures.push(new Error("MUSL_CONTAINER_PRE_REMOVAL_FAILED", { cause }))
  } finally {
    for (const id of owned) {
      await Promise.resolve().then(() => input.run(["rm", "--force", "--volumes", id])).then((result) => {
        // A repeated teardown may observe an already-removed immutable ID. Only
        // Docker's explicit missing-container diagnostic establishes that fact.
        if (result.code !== 0 && !(result.code === 1 && /No such (?:container|object)/i.test(result.stderr)))
          throw new Error(`MUSL_OWNED_CONTAINER_REMOVAL_FAILED: ${id}`, { cause: result })
        retired.push(id)
      }).catch((cause: unknown) => { failures.push(new Error(`MUSL_OWNED_CONTAINER_REMOVAL_FAILED: ${id}`, { cause })) })
    }
  }
  await census().then((remaining) => {
    if (remaining.length) throw new Error(`MUSL_OWNED_CONTAINER_SURVIVED_REMOVAL: ${remaining.join(",")}`)
  }).catch((cause: unknown) => { failures.push(new Error("MUSL_POST_REMOVAL_CENSUS_FAILED", { cause })) })
  if (failures.length) throw Object.assign(new AggregateError(failures, "MUSL_OWNED_TEARDOWN_INCOMPLETE"), { retired })
  return { retired }
}
