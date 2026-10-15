export * as AppDockNativeWorkspace from "./app-dock-native-workspace"

import type { AppDockRuntime } from "./app-dock-runtime"
import type { WorkspacePreparation } from "./app-dock-rpc"
import { NativeDockProtocol } from "./app-dock-native-protocol"

export function create(runtime: Pick<ReturnType<typeof AppDockRuntime.create>, "workspaceScope" | "native">): WorkspacePreparation {
  return async (_identity, placement, signal) => {
    if (signal.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native workspace preparation cancelled")
    // No helper resource has been acquired in this phase. A failed census is
    // explicitly not-dispatched, so its admission reservation can be released.
    const scope = await runtime.workspaceScope().catch(() => {
      throw new NativeDockProtocol.NativeError("ownership-unresolved", "Native workspace process evidence is unavailable")
    })
    if (signal.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native workspace preparation cancelled")
    if (scope.runtime.runtimeID !== placement.runtimeID || scope.runtime.runtimeEpoch !== placement.runtimeEpoch)
      throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace placement changed before preparation")
    const processIdentities = scope.processIdentities.map((process) => ({ ...process }))
    const expected = JSON.stringify({ runtime: scope.runtime, processIdentities })
    const resource = await runtime.native()
    // Return acquired resources immediately. RPC owns late cancellation, scope
    // rejection and orphan reaping; no post-acquisition await may lose that owner.
    return {
      client: resource.client,
      target: { scopeKind: "workspace", appID: "workspace", launchEpoch: resource.runtime.accessibilitySessionID,
        ownershipRevision: 0, runtime: { ...resource.runtime }, processIdentities },
      confirm: async (proposal) => {
        if (signal.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native workspace confirmation cancelled")
        if (JSON.stringify(resource.runtime) !== JSON.stringify(scope.runtime))
          throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace session changed during preparation")
        const fresh = await runtime.workspaceScope()
        if (signal.aborted) throw new NativeDockProtocol.NativeError("cancelled", "Native workspace confirmation cancelled")
        if (JSON.stringify(fresh) !== expected)
          throw new NativeDockProtocol.NativeError("wrong-scope", "Native workspace membership changed before confirmation")
        // Authorization is the whole verified workspace realm. These are actual
        // helper-proposed AT-SPI roots, not inferred X11/title/window pairings.
        return proposal.roots.map((root) => ({ owner: root.owner, path: root.path }))
      },
    }
  }
}
