import { makeDefaultApi } from "@orchestra/protocol/api"
import { InboxLocationMiddleware } from "./inbox-location"
import { LocationMiddleware } from "./location"
import { SessionLocationMiddleware } from "./middleware/session-location"

export const Api = makeDefaultApi({
  locationMiddleware: LocationMiddleware,
  inboxLocationMiddleware: InboxLocationMiddleware,
  sessionLocationMiddleware: SessionLocationMiddleware,
})
