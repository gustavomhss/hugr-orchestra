export * as FabricIdentityMsalContract from "./identity-msal-contract"

import type { INetworkModule } from "@azure/msal-node"
import type { Effect } from "effect"
import type { FabricIdentityProfile } from "./identity-profile"
import type { FabricIdentityTokens } from "./identity-token"
import type { FabricIdentityTokensContract } from "./identity-token-contract"
import type { FabricIdentityExchangeMaterialContract } from "./identity-exchange-material-contract"

// These are backend-only secrets/candidates, never wire schemas, tools, progress DTOs or execution authority.
export type Input = Readonly<{
  code: string
  material: FabricIdentityExchangeMaterialContract.Material
  tenantID?: string
  objectID?: string
}>
export type Candidate = Readonly<{
  proof: FabricIdentityTokensContract.Proof
  account: Readonly<{
    homeAccountID: string
    tenantID: string
    objectID: string
    environment: "login.microsoftonline.com"
  }>
  cache: Readonly<{ format: "msal-node"; version: 1; serialized: string }>
}>
export type Interface = Readonly<{ exchange: (input: Input) => Effect.Effect<Candidate, FabricIdentityTokens.Failure> }>
export type Factory = (
  options: Readonly<{
    profile: FabricIdentityProfile.Profile
    verifier: FabricIdentityTokensContract.Interface
    transport: INetworkModule
    certificate?: Readonly<{ certificate: string; privateKey: string }>
    now?: () => number
  }>,
) => Effect.Effect<Interface, FabricIdentityTokens.Failure>
