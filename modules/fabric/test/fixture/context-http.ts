// Repository-only HTTP qualification seam. Re-export the real implementation
// and committed-reservation instrument; never a second table or fake lifecycle.
export { FabricContextTable } from "../../src/context/sql"
export { reservationBarrier } from "./context-barrier"
