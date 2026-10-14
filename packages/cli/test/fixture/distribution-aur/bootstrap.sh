#!/usr/bin/bash
set -euo pipefail
fail() { printf '%s\n' "$1" >&2; exit 1; }
record_stdio() {
  local stage=$1 fd
  for fd in 1 2; do
    # Inspect the shell's descriptors, not cat's redirected output descriptor.
    /usr/bin/readlink "/proc/$$/fd/$fd" > "/proof/evidence/bootstrap-$stage-fd-$fd.target"
    /usr/bin/cat "/proc/$$/fdinfo/$fd" > "/proof/evidence/bootstrap-$stage-fd-$fd.fdinfo"
  done
}
bootstrap_evidence() {
  local stage=$1 status=0 log="/proof/evidence/bootstrap-$1-helper"
  record_stdio "before-$stage"
  # Bun's stdio initialization can set O_NONBLOCK on shared inherited pipe
  # descriptions. Give short helpers their own files; the shell keeps its pipes.
  /proof/bun /repo/packages/cli/test/fixture/distribution-aur/sandbox-evidence.ts "$stage" > "$log.stdout.log" 2> "$log.stderr.log" || status=$?
  printf '%s\n' "$status" > "$log.status"
  record_stdio "after-$stage"
  if (( status != 0 )); then
    printf 'AUR_BOOTSTRAP_EVIDENCE_HELPER_FAILED: stage=%s exit=%s stdout=%s stderr=%s\n' "$stage" "$status" "$log.stdout.log" "$log.stderr.log" >&2
    exit "$status"
  fi
}
checked_pacman_query() {
  local receipt=$1 status=0
  shift
  LC_ALL=C "$@" > "$receipt.txt" 2> "$receipt.stderr" || status=$?
  printf '%s\n' "$status" > "$receipt.status"
  (( status == 0 )) || fail AUR_PACMAN_POLICY_QUERY_FAILED
  [[ ! -s $receipt.stderr ]] || fail AUR_PACMAN_POLICY_QUERY_DIAGNOSTIC
}
pacman_policy_query() {
  local receipt=$1
  shift
  checked_pacman_query "$receipt" pacman-conf --config "$pacman_config" "$@"
}
[[ -f /.dockerenv && $(id -u) == 0 ]] || fail AUR_OWNED_DOCKER_GUEST_REQUIRED
[[ $# == 2 ]] || fail AUR_GUEST_BOOTSTRAP_ARGUMENTS_REQUIRED
[[ $(uname -m) == "$1" ]] || fail AUR_GUEST_NATIVE_CPU_MISMATCH
record_stdio entry
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
# The pinned official image explicitly disables Landlock in its default config.
# Preserve the source and let pacman-conf resolve all Includes before removing
# only that filesystem opt-out. All policy queries and -Syu use this owned file.
cp -- /etc/pacman.conf /proof/evidence/bootstrap-pacman-original.conf
checked_pacman_query /proof/evidence/bootstrap-pacman-version pacman --version
# Identity reads only the local package DB; sync repositories do not exist yet.
# Runtime policy queries and bootstrap still use the checked owned configuration.
checked_pacman_query /proof/evidence/bootstrap-pacman-package pacman --config /dev/null -Q pacman
pacman_config=/etc/pacman.conf
pacman_policy_query /proof/evidence/bootstrap-config-original
bootstrap_evidence config
pacman_config=/proof/evidence/bootstrap-pacman.conf
pacman_policy_query /proof/evidence/bootstrap-config-enforced
bootstrap_evidence config-verify
# Keep effective signed-repository policy and sandbox-user receipts. No fallback.
# pacman.conf(5), Pacman 7.1: DownloadUser selects the download/sandbox user.
if ! LC_ALL=C pacman-conf --config "$pacman_config" DownloadUser > /proof/evidence/bootstrap-sandbox-user.txt 2> /proof/evidence/bootstrap-download-user.stderr; then
  printf '%s\n' "$(< /proof/evidence/bootstrap-download-user.stderr)" >&2
  fail AUR_PACMAN_DOWNLOAD_USER_QUERY_FAILED
fi
[[ ! -s /proof/evidence/bootstrap-download-user.stderr ]] || fail AUR_PACMAN_DOWNLOAD_USER_QUERY_DIAGNOSTIC
download_user=$(< /proof/evidence/bootstrap-sandbox-user.txt)
[[ $download_user == alpm ]] || fail AUR_PACMAN_ALPM_DOWNLOAD_USER_REQUIRED
download_uid=$(id -u -- "$download_user") || fail AUR_PACMAN_DOWNLOAD_USER_ACCOUNT_UNAVAILABLE
[[ $download_uid =~ ^[1-9][0-9]*$ ]] || fail AUR_PACMAN_NONROOT_DOWNLOAD_USER_REQUIRED
printf '%s\n' "$download_uid" > /proof/evidence/bootstrap-download-user-uid.txt
pacman_policy_query /proof/evidence/bootstrap-repositories --repo-list
[[ -s /proof/evidence/bootstrap-repositories.txt ]] || fail AUR_PACMAN_SIGNED_REPOSITORIES_EMPTY
pacman_policy_query /proof/evidence/bootstrap-global-siglevel SigLevel
while IFS= read -r repository; do
  [[ $repository =~ ^[a-zA-Z0-9_-]+$ ]] || fail AUR_PACMAN_REPOSITORY_NAME_INVALID
  # Documented order: pacman-conf [options] [directive]. Empty successful
  # SigLevel output is ALPM_SIG_USE_DEFAULT; the reader requires safe global.
  pacman_policy_query "/proof/evidence/bootstrap-siglevel-$repository" --repo "$repository" SigLevel
done < /proof/evidence/bootstrap-repositories.txt
bootstrap_evidence policy
bootstrap_packages=(base-devel jq openssl ca-certificates curl nodejs git)
bootstrap_status=0
LC_ALL=C pacman --config "$pacman_config" --debug -Syu --noconfirm --needed "${bootstrap_packages[@]}" > /proof/evidence/bootstrap-pacman.log 2>&1 || bootstrap_status=$?
# A failed log replay must not hide the package manager's actual exit status.
printf '%s\n' "$bootstrap_status" > /proof/evidence/bootstrap-pacman.status
record_stdio after-pacman
bootstrap_log_status=0
printf '%s\n' "$(< /proof/evidence/bootstrap-pacman.log)" || bootstrap_log_status=$?
printf '%s\n' "$bootstrap_log_status" > /proof/evidence/bootstrap-pacman-replay.status
(( bootstrap_log_status == 0 )) || exit "$bootstrap_log_status"
(( bootstrap_status == 0 )) || fail "AUR_SIGNED_SANDBOXED_REPOSITORY_BOOTSTRAP_FAILED: pacman exit=$bootstrap_status"
bootstrap_evidence receipt
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
