#!/usr/bin/bash
set -euo pipefail
fail() { printf '%s\n' "$1" >&2; exit 1; }
[[ -f /.dockerenv && $(id -u) == 0 ]] || fail AUR_OWNED_DOCKER_GUEST_REQUIRED
[[ $# == 2 ]] || fail AUR_GUEST_BOOTSTRAP_ARGUMENTS_REQUIRED
[[ $(uname -m) == "$1" ]] || fail AUR_GUEST_NATIVE_CPU_MISMATCH
# Mandatory process state, including container init, before package-manager work.
for status in /proc/self/status /proc/1/status; do
  seccomp= nnp=
  while IFS=$'\t' read -r key value; do
    case "$key" in Seccomp:) seccomp=$value ;; NoNewPrivs:) nnp=$value ;; esac
  done < "$status"
  [[ $seccomp == 2 && $nnp == 1 ]] || fail AUR_GUEST_SECCOMP_AND_NO_NEW_PRIVILEGES_REQUIRED
done
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
# Keep effective signed-repository policy and sandbox-user receipts. No fallback.
# pacman.conf(5), Pacman 7.1: DownloadUser selects the download/sandbox user.
if ! LC_ALL=C pacman-conf DownloadUser > /proof/evidence/bootstrap-sandbox-user.txt 2> /proof/evidence/bootstrap-download-user.stderr; then
  printf '%s\n' "$(< /proof/evidence/bootstrap-download-user.stderr)" >&2
  fail AUR_PACMAN_DOWNLOAD_USER_QUERY_FAILED
fi
[[ ! -s /proof/evidence/bootstrap-download-user.stderr ]] || fail AUR_PACMAN_DOWNLOAD_USER_QUERY_DIAGNOSTIC
download_user=$(< /proof/evidence/bootstrap-sandbox-user.txt)
[[ $download_user == alpm ]] || fail AUR_PACMAN_ALPM_DOWNLOAD_USER_REQUIRED
download_uid=$(id -u -- "$download_user") || fail AUR_PACMAN_DOWNLOAD_USER_ACCOUNT_UNAVAILABLE
[[ $download_uid =~ ^[1-9][0-9]*$ ]] || fail AUR_PACMAN_NONROOT_DOWNLOAD_USER_REQUIRED
printf '%s\n' "$download_uid" > /proof/evidence/bootstrap-download-user-uid.txt
pacman-conf --repo-list > /proof/evidence/bootstrap-repositories.txt
[[ -s /proof/evidence/bootstrap-repositories.txt ]] || fail AUR_PACMAN_SIGNED_REPOSITORIES_EMPTY
while IFS= read -r repository; do
  [[ $repository =~ ^[a-zA-Z0-9_-]+$ ]] || fail AUR_PACMAN_REPOSITORY_NAME_INVALID
  pacman-conf --repo "$repository" SigLevel > "/proof/evidence/bootstrap-siglevel-$repository.txt"
done < /proof/evidence/bootstrap-repositories.txt
/proof/bun /repo/packages/cli/test/fixture/distribution-aur/sandbox-evidence.ts policy
bootstrap_packages=(base-devel jq openssl ca-certificates curl nodejs git)
bootstrap_status=0
LC_ALL=C pacman --debug -Syu --noconfirm --needed "${bootstrap_packages[@]}" > /proof/evidence/bootstrap-pacman.log 2>&1 || bootstrap_status=$?
printf '%s\n' "$(< /proof/evidence/bootstrap-pacman.log)"
(( bootstrap_status == 0 )) || fail "AUR_SIGNED_SANDBOXED_REPOSITORY_BOOTSTRAP_FAILED: pacman exit=$bootstrap_status"
/proof/bun /repo/packages/cli/test/fixture/distribution-aur/sandbox-evidence.ts receipt
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
  ORCHESTRA_AUR_BOOTSTRAP_SANDBOX=enforced \
  ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict ORCHESTRA_OMNI_CONTROL=declared \
  ORCHESTRA_DISTRIBUTION_DENO=/proof/deno ORCHESTRA_DISTRIBUTION_DENO_VERSION=2.9.7 \
  /proof/bun test --preload /repo/script/test-omni-control.ts --timeout 1800000 \
  ./test/fixture/distribution-aur-guest.test.ts
