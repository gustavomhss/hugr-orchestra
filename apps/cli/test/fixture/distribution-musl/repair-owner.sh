#!/bin/sh
set -eu
fail() { printf '%s\n' "$1" >&2; exit 1; }
[ -f /.dockerenv ] && [ "$(id -u)" = 0 ] || fail MUSL_REPAIR_OWNED_DOCKER_GUEST_REQUIRED
[ "$#" = 3 ] || fail MUSL_REPAIR_ARGUMENTS_REQUIRED
case "$1" in ????????-????-????-????-????????????) ;; *) fail MUSL_REPAIR_NONCE_INVALID ;; esac
case "$2:$3" in *[!0-9:]*|:*|*:) fail MUSL_REPAIR_OWNER_INVALID ;; esac
[ -d /proof ] && [ ! -L /proof ] && [ "$(readlink -f /proof)" = /proof ] || fail MUSL_REPAIR_PROOF_ROOT_REDIRECTED
# Host already verified ID/label/bind. Stop writers in this private PID namespace
# before marker/owner repair. This is teardown, never daemon qualification.
kill -STOP -1
[ -f /proof/.musl-ownership ] && [ ! -L /proof/.musl-ownership ] || fail MUSL_REPAIR_MARKER_REQUIRED
IFS= read -r marker < /proof/.musl-ownership
[ "$marker" = "$1" ] || fail MUSL_REPAIR_MARKER_MISMATCH
chown -R -h -P "$2:$3" /proof
printf '%s\n' MUSL_OWNED_FIXTURE_OWNER_REPAIRED
