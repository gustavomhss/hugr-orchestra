# Lifecycle, ownership and cancellation

Read when creation, durable pending work, interruption, teardown or resource lifetime changes behavior. A terminal label does not alone prove successful completion.

## Follow ownership transitions

Identify who admits work, schedules it, starts execution, owns active tasks/resources and records durable results. Separate input admission from execution and process-local coordination from durable state. Draw only relevant states and transitions with witness conditions; include failed, interrupted, idle, pending and resumed paths when they change the answer.

For each resource or child task, find its acquiring scope, cancellation link, release/finalizer and failure path. Check whether caller disconnect/deadline cancels owned work or only stops waiting for it. A promise/future may outlive its waiter; a durable row may outlive the active process. An idle interruption can legitimately be a no-op.

## Examine safe boundaries

Find where new input, steering, queued work or continuation is admitted/promoted. Determine ordering and the rule that reevaluates continuation. Do not infer a transcript boundary or durable run identity from a local drain/coordinator. Resume may join active work, wake pending work or recover interrupted execution; these are distinct contracts.

Inspect whether cancellation reaches model/provider, tools and owned child scopes; whether external effects can settle after interruption; and how uncertain settlement is reported. Catching cancellation without cleanup can change behavior, but its source occurrence alone does not prove a leak or production incident.

## Version-aware reading

Use the implementation and installed library/runtime version for cancellation semantics. In Effect code, read layer/scope ownership and fiber interruption rather than treating every fork as detached work. In other runtimes, inspect equivalent task groups, context cancellation or abort-signal propagation. Do not transfer semantics from a newer major or another framework.

When execution is observed, bind traces/results to exact input, runtime and cancellation timing. A successful cancellation test at one boundary does not cover all interleavings. Missing spans or truncated output do not establish that cleanup never ran.

## Probe and close

If the unresolved question needs timing evidence, specify the smallest permitted scratch recipe for a qualified executor: pause before/after the relevant effect, cancel the owner, observe settlement/release, and include a non-cancelled control. Define resources, timeout and cleanup. No product mutation, host shell or live-service restart belongs to this role.

Retain state witnesses and contrary terminal paths using [evidence](evidence.md). Explain what cancellation stops, what survives durably and who must recover it. Distinguish result sufficiency from actual host termination using [closure](closure.md); do not equate “done”, a terminal UI state or an empty active map with verified success.
