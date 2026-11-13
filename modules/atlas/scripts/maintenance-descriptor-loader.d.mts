import type { MaintenanceCallerDescriptor } from "../packages/adapter-io/src/evaluation-maintenance-caller.js"
/** Validates exact raw-byte SHA-256 and strict JSON schema, returning a recursively frozen descriptor. */
export declare function loadDescriptor(bytes: Uint8Array, expectedSha256: string): MaintenanceCallerDescriptor
