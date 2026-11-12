# Activity monitor

Open **Extensions → Monitor**. The page belongs to the selected server and opens without choosing a project.

**Worktrees** reads that server’s registered project directories. Only entries recorded with the `git_worktree` strategy appear. It lists their paths and projects; the count is the number of registrations, not a scan of the machine. Worktrees created outside this registry are not included. A registration can outlive its directory.

Use **Filter** to search a full path or project name. **Refresh** reads the registry again. While the tab is visible, it refreshes every ten seconds. **Age** is the time since each registry response was received, not the directory’s age. If a refresh fails, an error appears and the previous complete inventory remains visible with its original timestamps.

The registry has no recorded session owner, disk measurement, collapsed file identity or use proof. Owner stays empty; Logical is **unread**, Unique is **not collapsed**, and Use check is **unproved**. These rows offer no cleanup actions.

## Trees

**Trees** reads the ledger of pipe processes observed through this server process’s Omni spawner since startup. It refreshes the ledger and host CPU reading every two seconds while visible, without querying OS process membership. The initial inventory does not include processes already running before this server started, native collection calls, terminals or desktop processes.

Each row shows the executable, recorded owner when available, observed state, root PID, member count and reading age. Expand the executable and select **Read members** to request the PIDs and names from the supervisor. This is an explicit OS inventory query; automatic refresh keeps its last result and age. Membership comes from `omni.processes`; the monitor does not reconstruct a tree from parent PIDs. Root exit alone does not mean the tree is gone. After root exit, the tree state is **unknown** until an explicit membership reading confirms it.

The spawner reads the stored session title at process creation through the tool registry’s captured session store and records that name with the process. Later selection or renaming does not rewrite the recorded owner. Without recorded provenance, Owner stays empty.

Per-process CPU, footprint and machine memory pressure have not been measured. The **Tree id** column shows the native identity when the installed binding exposes it. A missing identity stays **unread**. Root PID, native tree id and observation UUID remain separate; stop and suspend are not offered. The API also identifies the server observation lifetime with `instanceID`, so a host restart cannot reuse an old address unnoticed. Inspection failure displays **unknown** and preserves any previous members with their original reading age. Failed HTTP refreshes also preserve the previous snapshot. The observer keeps the last 32 finished or unavailable observations and reports how many older records it retired.

**Docker**, **IN/OUT** and **Quarantine** currently report **collection unavailable**. This means their collectors are not connected; it does not mean the machine has no containers or quarantined files. Process telemetry and cleanup are still under development.

The category names stay in English in both supported languages. Tab through the category strip once, then use Left/Right, Home or End to select a category.


## Host CPU

The reading above Trees shows the fraction of reported logical-CPU time spent outside idle between two samples, with source `node.os.cpus`, the actual sample window and reading age. It normalizes the summed time counters, not per-core percentages. The first sample, an empty CPU list, zero counter progress, topology changes and counter resets do not produce a new numeric reading. The server retains the last valid reading with its timestamp and enforces a minimum 250 ms sample window across concurrent readers.

These counters are the operating system values returned by [Node’s `os.cpus()` API](https://nodejs.org/api/os.html#oscpus). This is host activity, not per-process or per-session attribution, CPU pressure, a cgroup capacity estimate, or memory pressure. A stale reading remains visible with increasing age. Process reading ages compare server timestamps to each other and then advance using the client’s monotonic clock, avoiding clock offsets between remote servers and the app.

## Cache, Temporary and Logs

These tabs list the server's declared Orchestra cache directory, temporary directory (`os.tmpdir()/orchestra`, never the whole system temporary directory) and log directory. Opening a tab reads cached metadata only. Select **Read disk usage** to start a bounded metadata walk of that named root. The API accepts the three root identifiers, not an arbitrary path. Both cached reads and explicit measurements require server authentication.

Each walk admits up to 10,000 entries, depth 64 and a cooperative two-second budget. Filesystem calls can take longer; the walk checks elapsed time between operations and marks an exceeded budget as partial. Symbolic links, unsupported entries, failures, detected path changes and numeric overflow leave explicit unread scopes. The details list the first 32 scopes and the full issue count. A limit recorded at the root covers all descendants the walk could not finish.

**Logical** holds only the last complete sum of regular-file lengths per path; hardlink paths each contribute their length. Empty, successfully read directories can produce zero. A partial retry shows its observed bytes separately and preserves the prior complete value with its original age. Before any complete reading, Logical and Age remain **unread**. These are metadata reading windows, not atomic filesystem snapshots or cleanup proofs. Changes racing metadata calls cannot be treated as a stable file identity for an action.

Owner stays empty, Unique stays **not collapsed** and Use check stays **unproved**. These measurements do not establish allocated, unique or reclaimable space. They do not cover external caches, unregistered roots or other temporary files, and do not offer cleanup. The memory ceiling does not see these paths.
