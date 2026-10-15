#!/usr/bin/bash
set -euo pipefail
fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ -f /.dockerenv && $(id -u) == 0 ]] || fail AUR_OWNED_DOCKER_GUEST_REQUIRED
[[ $# == 2 ]] || fail AUR_GUEST_BOOTSTRAP_ARGUMENTS_REQUIRED
[[ $(uname -m) == "$1" ]] || fail AUR_GUEST_NATIVE_CPU_MISMATCH
source /etc/os-release
case "$1" in
  x86_64)
    [[ $ID == arch && $NAME == 'Arch Linux' ]] || fail AUR_ARCH_DISTRO_REQUIRED
    pacman-key --init
    pacman-key --populate archlinux
    ;;
  aarch64)
    [[ $ID == archarm && $NAME == 'Arch Linux ARM' ]] || fail AUR_ARCHLINUXARM_DISTRO_REQUIRED
    pacman-key --init
    pacman-key --populate archlinuxarm
    ;;
  *) fail AUR_UNSUPPORTED_GUEST_CPU ;;
esac
# Keep repository signature verification. No unsigned package bootstrap override.
bootstrap_sandbox=default
bootstrap_packages=(base-devel jq openssl ca-certificates curl nodejs git)
if [[ $1 == aarch64 ]]; then
  bootstrap_log=$(mktemp /tmp/orchestra-aur-bootstrap.XXXXXX)
  bootstrap_status=0
  pacman -Syu --noconfirm --needed "${bootstrap_packages[@]}" > "$bootstrap_log" 2>&1 || bootstrap_status=$?
  bootstrap_diagnostic=$(< "$bootstrap_log")
  rm -- "$bootstrap_log"
  printf '%s\n' "$bootstrap_diagnostic"
  if (( bootstrap_status != 0 )); then
    [[ $bootstrap_diagnostic == *'error: restricting filesystem access failed because the Landlock ruleset could not be applied: Operation not permitted'* &&
       $bootstrap_diagnostic == *"error: switching to sandbox user 'alpm' failed!"* ]] || exit "$bootstrap_status"
    # The hosted ARM guest cannot apply this download Landlock ruleset, even
    # with seccomp unconfined. This exception is one owned bootstrap invocation:
    # no pacman.conf change, signature bypass, or pacman -U lifecycle override.
    bootstrap_sandbox=disabled-for-bootstrap-after-landlock-eperm
    printf '%s\n' 'AUR_BOOTSTRAP_SANDBOX_EXCEPTION: ARM repository bootstrap only; --disable-sandbox; repository signature verification retained; Landlock NOT qualified'
    pacman -Syu --disable-sandbox --noconfirm --needed "${bootstrap_packages[@]}"
  fi
fi
if [[ $1 == x86_64 ]]; then
  pacman -Syu --noconfirm --needed "${bootstrap_packages[@]}"
fi
useradd --create-home --uid 10001 builder
[[ $(id -u builder) != 0 ]] || fail AUR_MAKEPKG_NONROOT_REQUIRED
printf 'AUR guest provenance: image=%s cpu=%s distro=%s name=%s\n' "$2" "$(uname -m)" "$ID" "$NAME"
pacman --version
makepkg --version
bsdtar --version
curl --version
/proof/bun --version
cd /repo/packages/cli
exec /usr/bin/env CI=true PATH=/usr/local/sbin:/usr/local/bin:/usr/bin ORCHESTRA_AUR_GUEST=owned \
  ORCHESTRA_AUR_BOOTSTRAP_SANDBOX="$bootstrap_sandbox" \
  ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict ORCHESTRA_OMNI_CONTROL=declared \
  /proof/bun test --preload /repo/script/test-omni-control.ts --timeout 1800000 \
  ./test/fixture/distribution-aur-guest.test.ts
