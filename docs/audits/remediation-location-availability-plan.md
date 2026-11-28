# Location availability integration repair

The cold epic's real Server HTTP test `inbox-unmounted-http.test.ts` expected a missing Location's skill route to return the declared400, but received200. Core can successfully construct services for a missing directory, so mapping only failed boot effects cannot enforce the documented HTTP contract.

Root's frozen repair is Server-private: before a first Location cache acquisition, check whether the directory is absent or not a directory and refuse with the existing `InvalidRequestError/location_not_found`. Use the LayerMap's existing `rcMap` membership to preserve an already acquired Location after its directory is removed, as the current HTTP middleware documents. Keep boot failure mapping, workspace identity, Session placement and Core's Location construction unchanged. No public HttpApi schema changes are needed.

Acceptance uses actual routes and filesystem: retain installation Inbox listing for missing and empty directories; require400 for missing or file-valued first acquisitions; acquire a real directory, remove it, and require the cached Location to remain usable. Temporary paths are wholly owned by the test. No mock, user path mutation, new error type or weakened status assertion is authorized. Hosted RED precedes the production patch; independent source review and hosted GREEN follow it.
