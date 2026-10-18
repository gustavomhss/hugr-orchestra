#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <linux/landlock.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>

/* Native host compilation, then the same binary in the matching guest. No
 * compiler/package bootstrap is needed to measure the original guest kernel.
 * Restriction lasts until this single-threaded child exits; no reset operation.
 */
static void fail(const char *name) {
  fprintf(stderr, "%s: errno=%d (%s)\n", name, errno, strerror(errno));
  exit(1);
}

static void accessible(const char *path) {
  char byte;
  int fd = open(path, O_RDONLY | O_CLOEXEC);
  if(fd < 0 || read(fd, &byte, 1) != 1) fail("AUR_LANDLOCK_READ_POSITIVE_CONTROL_FAILED");
  if(close(fd)) fail("AUR_PROBE_CLOSE_FAILED");
  fd = open(path, O_WRONLY | O_CLOEXEC);
  if(fd < 0 || write(fd, "p", 1) != 1) fail("AUR_LANDLOCK_WRITE_POSITIVE_CONTROL_FAILED");
  if(close(fd)) fail("AUR_PROBE_CLOSE_FAILED");
}

static int denied(const char *path, int flags) {
  errno = 0;
  int fd = open(path, flags | O_CLOEXEC);
  int error = errno;
  if(fd != -1 || error != EACCES) fail("AUR_LANDLOCK_OUTSIDE_ACCESS_NOT_DENIED");
  return error;
}

int main(int argc, char **argv) {
  if(argc < 2) fail("AUR_SANDBOX_PROBE_ARGUMENTS_REQUIRED");
  int host = strcmp(argv[1], "host") == 0;
  int diagnose = strcmp(argv[1], "diagnose") == 0;
  if(!host && !diagnose && strcmp(argv[1], "enforce") != 0) fail("AUR_SANDBOX_PROBE_MODE_INVALID");
  int seccomp = prctl(PR_GET_SECCOMP, 0, 0, 0, 0);
  int nnp = prctl(PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0);
  /* getpid calibrates the raw syscall ABI; unshare(0) is a no-op in the
   * kernel, but the default Docker filter denies unshare without SYS_ADMIN.
   * Host success + guest EPERM distinguish filtering from a privileged op.
   */
  if(syscall(SYS_getpid) != getpid()) fail("AUR_RAW_SYSCALL_ABI_CONTROL_FAILED");
  errno = 0;
  long unshare_result = syscall(SYS_unshare, 0);
  int unshare_errno = unshare_result == -1 ? errno : 0;
  if(host) {
    printf("{\"mode\":\"host\",\"seccomp\":%d,\"noNewPrivileges\":%d,\"unshareResult\":%ld,\"unshareErrno\":%d}\n",
      seccomp, nnp, unshare_result, unshare_errno);
    if(unshare_result != 0) fail("AUR_HOST_UNSHARE_ZERO_POSITIVE_CONTROL_FAILED");
    return 0;
  }
  if(argc != 5) fail("AUR_SANDBOX_PROBE_PATHS_REQUIRED");
  if(seccomp != 2 || unshare_result != -1 || unshare_errno != EPERM) fail("AUR_SECCOMP_FILTER_NOT_ENFORCED");
  if(!diagnose && nnp != 1) fail("AUR_NO_NEW_PRIVILEGES_NOT_ENFORCED");
  errno = 0;
  int abi = syscall(SYS_landlock_create_ruleset, NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
  int abi_errno = abi < 0 ? errno : 0;
  if(abi < 1) {
    printf("{\"mode\":\"%s\",\"seccomp\":%d,\"noNewPrivileges\":%d,\"abi\":%d,\"abiErrno\":%d,\"enforced\":false}\n",
      argv[1], seccomp, nnp, abi, abi_errno);
    /* Diagnosis is not qualification. The final enforce child must succeed. */
    if(diagnose) return 0;
    fail("AUR_LANDLOCK_KERNEL_OR_PROFILE_UNAVAILABLE");
  }
  accessible(argv[3]);
  accessible(argv[4]);
  struct landlock_ruleset_attr ruleset = {
    .handled_access_fs = LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_WRITE_FILE | LANDLOCK_ACCESS_FS_READ_DIR,
  };
  int ruleset_fd = syscall(SYS_landlock_create_ruleset, &ruleset, sizeof(ruleset), 0);
  if(ruleset_fd < 0) fail("AUR_LANDLOCK_RULESET_CREATE_FAILED");
  struct landlock_path_beneath_attr rule = {
    .allowed_access = ruleset.handled_access_fs,
    .parent_fd = open(argv[2], O_PATH | O_CLOEXEC | O_DIRECTORY),
  };
  if(rule.parent_fd < 0) fail("AUR_LANDLOCK_ALLOWED_DIRECTORY_OPEN_FAILED");
  if(syscall(SYS_landlock_add_rule, ruleset_fd, LANDLOCK_RULE_PATH_BENEATH, &rule, 0))
    fail("AUR_LANDLOCK_ADD_RULE_FAILED");
  if(close(rule.parent_fd)) fail("AUR_PROBE_CLOSE_FAILED");
  errno = 0;
  int initial_restrict = syscall(SYS_landlock_restrict_self, ruleset_fd, 0);
  int initial_errno = initial_restrict < 0 ? errno : 0;
  if(diagnose && nnp == 0) {
    if(initial_restrict != -1 || initial_errno != EPERM) fail("AUR_LANDLOCK_PRIVILEGE_NEGATIVE_CONTROL_FAILED");
    if(prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0)) fail("AUR_PROBE_NO_NEW_PRIVILEGES_SET_FAILED");
    errno = 0;
    if(syscall(SYS_landlock_restrict_self, ruleset_fd, 0)) fail("AUR_LANDLOCK_AFTER_NO_NEW_PRIVILEGES_FAILED");
  } else if(initial_restrict) {
    printf("{\"mode\":\"%s\",\"abi\":%d,\"noNewPrivileges\":%d,\"restrictResult\":%d,\"restrictErrno\":%d,\"enforced\":false}\n",
      argv[1], abi, nnp, initial_restrict, initial_errno);
    fail("AUR_LANDLOCK_RESTRICT_SELF_FAILED");
  }
  if(close(ruleset_fd)) fail("AUR_PROBE_CLOSE_FAILED");
  accessible(argv[3]);
  int read_errno = denied(argv[4], O_RDONLY);
  int write_errno = denied(argv[4], O_WRONLY);
  printf("{\"mode\":\"%s\",\"seccomp\":%d,\"noNewPrivileges\":%d,\"abi\":%d,\"abiErrno\":%d,"
    "\"unshareResult\":%ld,\"unshareErrno\":%d,\"initialRestrictResult\":%d,\"initialRestrictErrno\":%d,"
    "\"finalNoNewPrivileges\":%d,\"outsideBefore\":\"read-write-allowed\",\"insideAfter\":\"read-write-allowed\","
    "\"outsideReadErrno\":%d,\"outsideWriteErrno\":%d,\"enforced\":true}\n",
    argv[1], seccomp, nnp, abi, abi_errno, unshare_result, unshare_errno, initial_restrict, initial_errno,
    prctl(PR_GET_NO_NEW_PRIVS, 0, 0, 0, 0), read_errno, write_errno);
  return 0;
}
