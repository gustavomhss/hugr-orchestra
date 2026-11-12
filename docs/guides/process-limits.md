# Process resource limits

Processes started through [Omni](omni.md) can have a timeout, cancellation signal and resident-memory cap for their supervised tree.

A timeout keeps its original deadline when the process exits but leaves descendants running. Cancellation still applies to those descendants. A temporarily busy supervisor or incomplete process inventory does not disable either protection or restart its timer.

Memory caps sample the tree every 250 ms. A temporary inventory failure or failed sampling task is retried on the next sample. When a successful sample exceeds the cap, Omni requests a forced stop of the tree with the `MemoryExceeded` reason. Sampling is periodic, so the cap is not an instantaneous memory ceiling.

An explicit process-inventory request can still fail while the inventory is unavailable; retry after the temporary condition clears. Losing the supervisor is a terminal failure, and does not prove its processes were reaped. On Unix, processes that deliberately leave their supervised session remain outside the tree's stop boundary.
