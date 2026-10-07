# Django and DRF

## Applicability

A component whose endpoints are Django REST framework views on Django. The frozen tuple is Django `6.1.2` and DRF `3.18.3` on CPython `3.12.11`. Typed checks, when the project uses them: django-stubs `6.1.2` with its mypy plugin on mypy `2.4.0`, and djangorestframework-stubs `3.18.1`. OpenAPI, when the project uses it: drf-spectacular `0.30.0`. The project's lock file governs; where it differs, the version notes below are unverified for that project. Read [Python](../../languages/python.md) first; its error and test rules apply, its async rules only to async Django views.

## Non-trigger

- FastAPI, django-ninja or plain Django views returning `JsonResponse`: DRF parsers, serializers and permissions do not run there.
- Adding DRF, typed checks or drf-spectacular to a project that lacks them. That is a `packet` blocker.
- Changing settings, middleware order, `DEFAULT_*` DRF classes or the exception handler unless the packet assigns it.

## Inputs

- The settings module, the app, the URLconf or router that owns the path, and the viewset, serializer and permission classes to follow.
- The authentication classes, the error envelope (DRF default or a custom `EXCEPTION_HANDLER`) and the test command: `python manage.py test <label>` or pytest with pytest-django.
- Whether the lock pins django-stubs, the mypy plugin settings and drf-spectacular.

## Steps

1. Register on the existing router or URLconf: `router.register("tasks", TaskViewSet, basename="task")`, or `path(...)` in the app's `urls.py`.
2. Validate through a serializer and use only `validated_data`:
   ```python
   s = TaskIn(data=request.data)
   s.is_valid(raise_exception=True)  # 400 through the exception handler
   ```
   A serializer ignores unknown keys. A contract that rejects them checks `set(request.data) - set(s.fields)` itself. PATCH passes `partial=True`.
3. Scope by principal in `get_queryset()`, e.g. `Task.objects.filter(owner=self.request.user)`, so another tenant's row is a 404. `get_object()` runs `check_object_permissions`; a handler that loads an object itself must call `self.check_object_permissions(request, obj)`. `has_object_permission` never runs for list or create.
4. Write inside `transaction.atomic()`. Lock rows with `select_for_update()` inside that block. Send mail, enqueue jobs and publish events with `transaction.on_commit(...)`, never before the commit.
5. A uniqueness validator is not a guarantee under concurrency. Rely on the database constraint and map `IntegrityError` to the contract's 409.
6. Raise DRF exceptions (`ValidationError`, `NotFound`, `PermissionDenied`) for mapped outcomes. Django's `Http404` and `PermissionDenied` are also mapped; anything else is a 500.
7. Load relations the serializer renders with `select_related` or `prefetch_related` in `get_queryset()`.
8. Generate schema migrations with `python manage.py makemigrations <app>` and review the file; follow [migration phases](../../data/migration-phase.md). Never edit an applied migration.

## Tools and outputs

- Tests through the URLconf with `APIClient` or `APITestCase`. `force_authenticate` skips the credential check, so authentication needs its own test with a real credential.
- Typed checks: run the project's own pinned mypy through the project's own command, e.g. `python -m mypy <paths>` in the project environment, with the plugin configured as `mypy_django_plugin.main` and `django_settings_module`. If django-stubs or mypy is absent from the lock or unpinned, return a `packet` blocker. Never install anything.
- OpenAPI, only when drf-spectacular is in the lock and `INSTALLED_APPS`: `python manage.py spectacular --validate --file <path>` with the project's flags. Describe what introspection misses with `@extend_schema`. The schema is derived; regenerate it, never edit it.
- Outputs: handwritten views, serializers, permissions, migrations reviewed after generation, and tests.

## Limits and checks

- django-stubs tracks the Django minor; a stubs and Django mismatch is reported, never fixed by changing either pin.
- The mypy plugin imports the settings module, so missing environment variables fail the check. Report that as a `packet` blocker, not a type error.
- `TestCase` wraps each test in a transaction: `on_commit` callbacks run only inside `self.captureOnCommitCallbacks(execute=True)`, and lock or race claims need `TransactionTestCase`.
- DRF views are synchronous; the ORM raises `SynchronousOnlyOperation` when called synchronously from async code.
- Checks through the URLconf: the success status and body, a validation failure, unauthenticated and forbidden cases, another principal's row as 404, and each mapped conflict.
