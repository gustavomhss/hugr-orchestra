import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { ForbiddenError, UnauthorizedError } from "../errors"

export class CapabilityAuthorization extends HttpApiMiddleware.Service<CapabilityAuthorization>()(
  "@orchestra/CapabilityAuthorization",
  { error: [UnauthorizedError, ForbiddenError] },
) {}
