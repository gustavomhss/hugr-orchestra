#include <sys/socket.h>
#include <sys/syscall.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <libproc.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <errno.h>
#include <stddef.h>
#include <poll.h>

#define CHECK(x) do { if (!(x)) { fprintf(stderr, "FAIL line %d errno %d\n", __LINE__, errno); exit(9); } } while (0)
static int port;
static const char *path;

// Oracle deliberately bypasses libc interposition. Darwin's public syscall()
// entrypoint is deprecated; use the architecture's syscall ABI for these three
// fixed operations only, without suppressing compiler diagnostics.
static int kernel_call(int number, int first, int second) {
#if defined(__x86_64__)
    long result = 0x2000000 | number;
    unsigned char failed;
    __asm__ volatile("syscall; setc %1" : "+a"(result), "=qm"(failed) : "D"((long)first), "S"((long)second) : "rcx", "r11", "cc", "memory");
#elif defined(__aarch64__)
    register long result __asm__("x0") = first;
    register long argument __asm__("x1") = second;
    register long call __asm__("x16") = number;
    unsigned failed;
    __asm__ volatile("svc #0x80; cset %w1, cs" : "+r"(result), "=r"(failed) : "r"(argument), "r"(call) : "cc", "memory");
#else
#error Unsupported Darwin syscall ABI
#endif
    if (failed) { errno = (int)result; return -1; }
    return (int)result;
}

static int dial(int mode) {
    int nonblock = mode == 1;
    int fdflags = mode == 2 ? 0 : FD_CLOEXEC;
    int fd = socket(AF_INET, SOCK_STREAM, 0); CHECK(fd >= 0);
    CHECK(fcntl(fd, F_SETFD, fdflags) == 0);
    if (nonblock) CHECK(fcntl(fd, F_SETFL, O_NONBLOCK) == 0);
    int flags = fcntl(fd, F_GETFL);
    struct sockaddr_in addr = {0}; addr.sin_len = sizeof(addr); addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK); addr.sin_port = htons(port);
    int result = connect(fd, (struct sockaddr *)&addr, sizeof(addr));
    CHECK(result == 0 || (nonblock && errno == EINPROGRESS));
    if (result < 0) {
        struct pollfd p = { .fd = fd, .events = POLLOUT }; CHECK(poll(&p, 1, 1000) == 1);
        int error = -1; socklen_t size = sizeof(error);
        CHECK(getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &size) == 0 && error == 0);
    }
    CHECK(fcntl(fd, F_GETFD) == fdflags && fcntl(fd, F_GETFL) == flags);
    return fd;
}
static int unix_dial(void) {
    int fd = socket(AF_UNIX, SOCK_STREAM, 0); CHECK(fd >= 0);
    struct sockaddr_un addr = {0}; addr.sun_family = AF_UNIX;
    CHECK(strlen(path) < sizeof(addr.sun_path)); strcpy(addr.sun_path, path);
    addr.sun_len = (unsigned char)(offsetof(struct sockaddr_un, sun_path) + strlen(path) + 1);
    CHECK(connect(fd, (struct sockaddr *)&addr, addr.sun_len) == 0);
    return fd;
}
static void family_checked(int fd, int expected, int line) {
    struct sockaddr_storage addr = {0}; socklen_t size = sizeof(addr);
    int result = getpeername(fd, (struct sockaddr *)&addr, &size);
    if (result != 0 || addr.ss_family != expected) {
        fprintf(stderr, "FAMILY caller=%d fd=%d expected=%d actual=%d result=%d errno=%d\n", line, fd, expected, addr.ss_family, result, errno);
        exit(9);
    }
    if (expected == AF_INET) {
        const struct sockaddr_in *in = (const struct sockaddr_in *)&addr;
        CHECK(size == sizeof(*in) && in->sin_port == htons(port) && in->sin_addr.s_addr == htonl(INADDR_LOOPBACK));
    }
}
#define family(fd, expected) family_checked(fd, expected, __LINE__)
static void copy_lengths(int fd) {
    for (int remote = 0; remote < 2; remote++) {
        for (unsigned n = 0; n <= 64; n++) {
            unsigned char buf[80]; memset(buf, 0xa5, sizeof(buf)); socklen_t size = n;
            CHECK((remote ? getpeername(fd, (struct sockaddr *)buf, &size) : getsockname(fd, (struct sockaddr *)buf, &size)) == 0);
            CHECK(size == sizeof(struct sockaddr_in));
            for (unsigned i = n < size ? n : size; i < sizeof(buf); i++) CHECK(buf[i] == 0xa5);
        }
        socklen_t size = 0;
        CHECK((remote ? getpeername(fd, NULL, &size) : getsockname(fd, NULL, &size)) == 0);
        CHECK(size == sizeof(struct sockaddr_in));
        size = 1;
        CHECK((remote ? getpeername(fd, NULL, &size) : getsockname(fd, NULL, &size)) == -1 && errno == EFAULT);
        struct sockaddr_in addr = {0}; size = sizeof(addr);
        CHECK((remote ? getpeername(fd, (struct sockaddr *)&addr, NULL) : getsockname(fd, (struct sockaddr *)&addr, NULL)) == -1 && errno == EFAULT);
        CHECK(getsockname(fd, (struct sockaddr *)&addr, &size) == 0);
        CHECK(addr.sin_len == sizeof(addr) && addr.sin_family == AF_INET && addr.sin_port == 0 && addr.sin_addr.s_addr == htonl(INADDR_LOOPBACK));
    }
}
static void *worker(void *unused) {
    (void)unused;
    for (int i = 0; i < 16; i++) { int fd = dial(i % 2); family(fd, AF_INET); CHECK(close(fd) == 0); }
    return NULL;
}
static int fd_count(void) {
    struct proc_fdinfo fds[4096];
    int bytes = proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, fds, sizeof(fds));
    CHECK(bytes > 0 && bytes < (int)sizeof(fds) && bytes % sizeof(*fds) == 0);
    return bytes / (int)sizeof(*fds);
}
int main(int argc, char **argv) {
    CHECK(argc == 3); port = atoi(argv[1]); path = argv[2];
    int before = fd_count();
    int control = socket(AF_UNIX, SOCK_STREAM, 0); CHECK(control >= 0);
    CHECK(fd_count() == before + 1);
    struct socket_fdinfo info = {0};
    CHECK(proc_pidfdinfo(getpid(), control, PROC_PIDFDSOCKETINFO, &info, sizeof(info)) == sizeof(info));
    CHECK(info.psi.soi_so && !(info.pfi.fi_status & PROC_FP_SHARED));
    int alias = dup(control); CHECK(alias >= 0);
    CHECK(proc_pidfdinfo(getpid(), control, PROC_PIDFDSOCKETINFO, &info, sizeof(info)) == sizeof(info));
    CHECK(info.pfi.fi_status & PROC_FP_SHARED);
    CHECK(close(alias) == 0);
    CHECK(proc_pidfdinfo(getpid(), control, PROC_PIDFDSOCKETINFO, &info, sizeof(info)) == sizeof(info));
    CHECK(!(info.pfi.fi_status & PROC_FP_SHARED)); CHECK(close(control) == 0);
    puts("OS PROC_FP_SHARED single/duplicate/single control OK");
    int fd = dial(0); family(fd, AF_INET); copy_lengths(fd);
    int nb = dial(1); family(nb, AF_INET); CHECK(close(nb) == 0);
    nb = dial(2); family(nb, AF_INET); CHECK(close(nb) == 0);
    puts("ADDRESS lengths 0..64/null/local/remote; FLAGS blocking/nonblocking/cloexec on/off OK");
    int direct = unix_dial(); family(direct, AF_UNIX);
    int copy = dup(fd); CHECK(copy >= 0); family(copy, AF_INET); CHECK(close(copy) == 0);
    copy = fcntl(fd, F_DUPFD, 40); CHECK(copy >= 40); family(copy, AF_INET); CHECK(close(copy) == 0);
    copy = fcntl(fd, F_DUPFD_CLOEXEC, 40); CHECK(copy >= 40); family(copy, AF_INET);
    CHECK(fcntl(copy, F_GETFD) == FD_CLOEXEC); CHECK(close(copy) == 0);
    CHECK(dup2(fd, fd) == fd); family(fd, AF_INET);
    copy = dup(direct); CHECK(copy >= 0); CHECK(dup2(fd, copy) == copy); family(copy, AF_INET);
    CHECK(close(fd) == 0); family(copy, AF_INET);
    CHECK(dup2(direct, copy) == copy); family(copy, AF_UNIX); CHECK(close(copy) == 0);
    fd = dial(0); CHECK(kernel_call(SYS_dup2, direct, fd) == fd); family(fd, AF_UNIX); CHECK(close(fd) == 0);
    fd = dial(0); copy = kernel_call(SYS_dup, fd, 0); CHECK(copy >= 0); family(copy, AF_INET);
    CHECK(kernel_call(SYS_close, fd, 0) == 0); family(copy, AF_INET); CHECK(close(copy) == 0);
    fd = dial(0); CHECK(kernel_call(SYS_close, fd, 0) == 0); copy = unix_dial(); CHECK(copy == fd); family(copy, AF_UNIX); CHECK(close(copy) == 0);
    fd = dial(0); CHECK(close(fd) == 0); copy = open("/dev/null", O_RDONLY); CHECK(copy == fd);
    struct sockaddr_storage addr; socklen_t size = sizeof(addr);
    CHECK(getpeername(copy, (struct sockaddr *)&addr, &size) == -1 && errno == ENOTSOCK); CHECK(close(copy) == 0);
    CHECK(dup(-1) == -1 && dup2(-1, direct) == -1);
    CHECK(fcntl(-1, F_DUPFD, 0) == -1 && fcntl(-1, F_DUPFD_CLOEXEC, 0) == -1);
    family(direct, AF_UNIX); CHECK(close(direct) == 0);
    puts("ALIASES dup/dup2/self/fcntl/raw; CLOSE/reuse/Unix/file/failed-dup OK");
    pthread_t workers[4];
    for (int i = 0; i < 4; i++) CHECK(pthread_create(&workers[i], NULL, worker, NULL) == 0);
    // Fork while other threads dial, close and query. Inherited aliases still
    // validate against the child's own proc_pidfdinfo and real Unix peer.
    fd = dial(0);
    for (int i = 0; i < 4; i++) {
        pid_t child = fork(); CHECK(child >= 0);
        if (child == 0) { alarm(5); family(fd, AF_INET); int fresh = dial(1); family(fresh, AF_INET); close(fresh); _exit(0); }
        int status = 0; CHECK(waitpid(child, &status, 0) == child && WIFEXITED(status) && WEXITSTATUS(status) == 0);
    }
    CHECK(close(fd) == 0);
    for (int i = 0; i < 4; i++) CHECK(pthread_join(workers[i], NULL) == 0);
    puts("THREADS 4x16; FORK concurrent/inherited/fresh OK");
    // More than the registry bound exercises OS-refcount reclamation of pins
    // after raw closes, rather than an unbounded lifetime/reference leak.
    for (int i = 0; i < 1050; i++) {
        fd = dial(0); family(fd, AF_INET);
        // A round trip keeps the real listener's accept backlog from becoming
        // the bottleneck of a tight raw-close churn probe.
        char byte = 'x'; CHECK(write(fd, &byte, 1) == 1); CHECK(read(fd, &byte, 1) == 1 && byte == 'x');
        CHECK(kernel_call(SYS_close, fd, 0) == 0);
    }
    fd = dial(0); family(fd, AF_INET); CHECK(close(fd) == 0);
    CHECK(fd_count() == before);
    puts("REGISTRY bounded raw-close churn/reclamation OK");
    puts("FD inventory positive control/final baseline restored OK");
    return 0;
}
