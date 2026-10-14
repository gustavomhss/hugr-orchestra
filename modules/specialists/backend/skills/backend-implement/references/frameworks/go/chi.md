# chi router

## Applicability

A Go component whose routes are registered on `github.com/go-chi/chi/v5` at `v5.3.2` (its module floor is Go 1.23; the tuple runs Go 1.25 or later). Read [Go](../../languages/go.md) first: decoding, context and error rules there apply unchanged.

## Non-trigger

- A component on the standard `ServeMux`, Gin or Echo. Never migrate it to chi.
- chi listed in `go.mod` for another component.
- Reordering the global middleware stack, or changing the timeout or error renderer policy, unless the packet assigns it.

## Inputs

- The router file and the route group or subrouter that owns the path.
- The middleware stack and its order, the principal accessor and the JSON error renderer.
- Whether path parameters are compared raw or decoded.

## Steps

1. Register the route in the group the packet names:
   ```go
   r.Route("/projects/{projectID}", func(r chi.Router) {
       r.Use(requireProject) // runs after the prefix matched
       r.Post("/tasks", h.CreateTask)
   })
   ```
   `Route` mounts a subrouter at the prefix. `Group` keeps the prefix and copies the middleware stack, so its `Use` calls affect only that group. `With(mw...)` scopes middleware to one endpoint.
2. Read path parameters with `chi.URLParam(r, "projectID")`. It returns `""` for a name the matched pattern does not define, so an empty value is a wiring bug, not a missing resource. Parse and validate it like body input.
3. Keep path and body values apart: the body DTO has no field for an identifier the path supplies.
4. Write middleware as `func(http.Handler) http.Handler`. To reject, write the assigned error and return without calling `next.ServeHTTP`. To pass a value on, call `next.ServeHTTP(w, r.WithContext(ctx))` with a context derived from `r.Context()`.
5. Call the service with `r.Context()`.

## Tools and outputs

- `chi.NewRouter`, `Route`, `Group`, `With`, `Use`, `URLParam`, and stock middleware from `github.com/go-chi/chi/v5/middleware` only where the stack already uses it.
- Tests build the real router and call `router.ServeHTTP(rec, req)`. A direct handler test needs a route context:
   ```go
   rctx := chi.NewRouteContext()
   rctx.URLParams.Add("projectID", "p1")
   req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
   ```
   That proves the handler only, not the route, the method or the middleware order.
- Outputs: handwritten routes, handlers, middleware and tests. chi generates nothing.

## Limits and checks

- Calling `Use` on a mux after a route is registered on it panics at startup. Add middleware before the routes, or use `With` or `Group`.
- Middleware on the top-level router runs before routing, so `chi.URLParam` there returns `""`. Path-dependent checks such as tenant or project ownership go inside `Route` or `With`.
- Middleware wraps in registration order, outermost first. Recovery must sit outside everything it should catch; authentication must run before any handler that trusts the principal.
- chi matches on `r.URL.RawPath` when it is set, so a parameter can arrive still percent-encoded. Unescape with `url.PathUnescape` only when the packet's contract defines decoded identifiers.
- A known path with the wrong method gets chi's 405, not 404. A contract with its own error envelope uses the project's `NotFound` and `MethodNotAllowed` handlers.
- `middleware.Timeout` cancels the request context and writes 504 only after the handler returns, which has no effect once a response was written. It never stops work that ignores the context, so every repository call takes `r.Context()`.
- Checks through the router: the assigned path and method, a wrong-method case, a path-dependent middleware rejection that never reaches the service, and the timeout path when assigned.
