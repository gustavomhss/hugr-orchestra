#!/usr/bin/bash
set -euo pipefail
fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ -f /.dockerenv && $(id -u) == 0 ]] || fail AUR_REPAIR_OWNED_DOCKER_GUEST_REQUIRED
[[ $# == 3 && $1 =~ ^[0-9a-f-]{36}$ && $2 =~ ^[0-9]+$ && $3 =~ ^[0-9]+$ ]] || fail AUR_REPAIR_OWNER_ARGUMENTS_INVALID
[[ -d /proof && ! -L /proof && $(readlink -f /proof) == /proof ]] || fail AUR_REPAIR_PROOF_ROOT_REDIRECTED
# Host verified this container ID, label and bind source. Stop other processes in
# this private PID namespace before touching the fixture; kill(-1) excludes this
# shell and PID 1. This is container teardown, not authenticated daemon-exit proof.
kill -STOP -- -1
[[ -f /proof/.aur-ownership && ! -L /proof/.aur-ownership ]] || fail AUR_REPAIR_OWNERSHIP_MARKER_REQUIRED
IFS= read -r marker < /proof/.aur-ownership
[[ $marker == "$1" ]] || fail AUR_REPAIR_OWNERSHIP_MARKER_MISMATCH
# -P does not traverse symbolic links; -h changes link ownership, not its target.
# Only this already-verified bind mount is repaired, never /repo or host HOME.
chown --recursive --no-dereference -P -- "$2:$3" /proof
printf '%s\n' AUR_OWNED_FIXTURE_OWNER_REPAIRED
