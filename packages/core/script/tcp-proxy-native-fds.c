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
#include <netinet/tcp.h>
#include <time.h>
#include <signal.h>
#include <stdatomic.h>
#include <sys/resource.h>

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
    __asm__ volatile("syscall; setc %1" : "+a"(result), "=qm"(failed) : "D"((long)first), "S"((long)second), "d"(0L) : "rcx", "r11", "cc", "memory");
#elif defined(__aarch64__)
    register long result __asm__("x0") = first;
    register long argument __asm__("x1") = second;
    register long call __asm__("x16") = number;
    register long protocol __asm__("x2") = 0;
    unsigned failed;
    __asm__ volatile("svc #0x80; cset %w1, cs" : "+r"(result), "=r"(failed) : "r"(argument), "r"(call), "r"(protocol) : "cc", "memory");
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
static void count_eventually(int expected, const char *tag) {
    for (int i = 0; i < 300; i++) {
        if (fd_count() == expected) return;
        usleep(10000);
    }
    fprintf(stderr, "%s expected=%d actual=%d\n", tag, expected, fd_count());
    exit(9);
}
static struct sockaddr_in target(void) {
    struct sockaddr_in addr = {0}; addr.sin_len = sizeof(addr); addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK); addr.sin_port = htons(port);
    return addr;
}
static void echo(int fd, const char *text) {
    size_t n = strlen(text); CHECK(n < 128);
    CHECK(write(fd, text, n) == (ssize_t)n);
    char received[128];
    for (size_t i = 0; i < n;) {
        ssize_t got = read(fd, received + i, n - i); CHECK(got > 0); i += (size_t)got;
    }
    CHECK(memcmp(text, received, n) == 0);
}
static void unconnected(int fd) {
    struct sockaddr_in addr = {0}; socklen_t size = sizeof(addr);
    CHECK(getsockname(fd, (struct sockaddr *)&addr, &size) == 0);
    CHECK(size == sizeof(addr) && addr.sin_family == AF_INET && addr.sin_addr.s_addr == htonl(INADDR_LOOPBACK) && addr.sin_port == 0);
    CHECK(getpeername(fd, (struct sockaddr *)&addr, &size) == -1 && errno == ENOTCONN);
}
static void preconnect(int with_fork) {
    int before = fd_count();
    int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP); CHECK(fd >= 0);
    int aliases[4] = {fd, dup(fd), fcntl(fd, F_DUPFD, 40), fcntl(fd, F_DUPFD_CLOEXEC, 40)};
    struct socket_fdinfo info = {0};
    CHECK(proc_pidfdinfo(getpid(), fd, PROC_PIDFDSOCKETINFO, &info, sizeof(info)) == sizeof(info));
    uint64_t handle = info.psi.soi_so; CHECK(handle && info.psi.soi_family == AF_UNIX);
    for (int i = 0; i < 4; i++) { CHECK(aliases[i] >= 0); unconnected(aliases[i]); }
    struct sockaddr_in addr = target();
    CHECK(bind(fd, (struct sockaddr *)&addr, sizeof(addr)) == -1 && errno == EPERM);
    addr.sin_port = 0;
    CHECK(connect(fd, (struct sockaddr *)&addr, sizeof(addr)) == -1 && errno == EPERM);
    unconnected(fd);
    int enabled = 1;
    CHECK(setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &enabled, sizeof(enabled)) == -1 && (errno == ENOTSUP || errno == EOPNOTSUPP || errno == ENOPROTOOPT));
    addr = target();
    if (with_fork) {
        int signal[2]; CHECK(pipe(signal) == 0);
        pid_t child = fork(); CHECK(child >= 0);
        if (child == 0) {
            alarm(5); close(signal[0]);
            CHECK(connect(aliases[1], (struct sockaddr *)&addr, sizeof(addr)) == 0);
            family(fd, AF_INET); echo(aliases[2], "preconnect-child");
            CHECK(write(signal[1], "G", 1) == 1);
            for (int i = 0; i < 4; i++) close(aliases[i]);
            close(signal[1]); exit(0);
        }
        close(signal[1]); char ready; CHECK(read(signal[0], &ready, 1) == 1 && ready == 'G'); close(signal[0]);
        int status; CHECK(waitpid(child, &status, 0) == child && WIFEXITED(status) && WEXITSTATUS(status) == 0);
    } else CHECK(connect(aliases[1], (struct sockaddr *)&addr, sizeof(addr)) == 0);
    for (int i = 0; i < 4; i++) {
        CHECK(proc_pidfdinfo(getpid(), aliases[i], PROC_PIDFDSOCKETINFO, &info, sizeof(info)) == sizeof(info));
        if (info.psi.soi_so != handle) { fprintf(stderr, "PRECONNECT_IDENTITY split alias=%d\n", i); exit(9); }
    }
    for (int i = 0; i < 4; i++) { family(aliases[i], AF_INET); echo(aliases[i], "preconnect-parent"); }
    for (int i = 0; i < 4; i++) CHECK(close(aliases[i]) == 0);
    int raw = kernel_call(SYS_socket, AF_INET, SOCK_STREAM); CHECK(raw >= 0);
    CHECK(connect(raw, (struct sockaddr *)&addr, sizeof(addr)) == -1 && errno == EPERM); close(raw);
    count_eventually(before, "PRECONNECT_KEEPERS");
    puts(with_fork ? "PRECONNECT fork shared socket/addresses/bytes OK" : "PRECONNECT dup/fcntl shared socket/addresses/bytes OK");
}
struct connect_race {
    pthread_mutex_t lock;
    pthread_cond_t ready;
    int arrived, go, fd;
    const struct sockaddr *addr;
    socklen_t size;
};
struct connect_result { struct connect_race *race; int result, error; };
static void *connect_worker(void *input) {
    struct connect_result *out = input;
    pthread_mutex_lock(&out->race->lock);
    out->race->arrived++;
    pthread_cond_broadcast(&out->race->ready);
    while (!out->race->go) pthread_cond_wait(&out->race->ready, &out->race->lock);
    pthread_mutex_unlock(&out->race->lock);
    out->result = connect(out->race->fd, out->race->addr, out->race->size); out->error = errno;
    return NULL;
}
static void concurrent_connect(int native_unix) {
    int before = fd_count();
    for (int round = 0; round < 20; round++) {
        struct sockaddr_in in = target();
        struct sockaddr_un un = {0}; un.sun_family = AF_UNIX; strcpy(un.sun_path, path);
        un.sun_len = (unsigned char)(offsetof(struct sockaddr_un, sun_path) + strlen(path) + 1);
        int fd = socket(native_unix ? AF_UNIX : AF_INET, SOCK_STREAM, 0); CHECK(fd >= 0);
        struct connect_race race = {.lock = PTHREAD_MUTEX_INITIALIZER, .ready = PTHREAD_COND_INITIALIZER, .fd = fd,
            .addr = native_unix ? (struct sockaddr *)&un : (struct sockaddr *)&in, .size = native_unix ? un.sun_len : sizeof(in)};
        struct connect_result results[8]; pthread_t workers[8];
        for (int i = 0; i < 8; i++) { results[i].race = &race; CHECK(pthread_create(&workers[i], NULL, connect_worker, &results[i]) == 0); }
        pthread_mutex_lock(&race.lock);
        while (race.arrived != 8) pthread_cond_wait(&race.ready, &race.lock);
        race.go = 1; pthread_cond_broadcast(&race.ready); pthread_mutex_unlock(&race.lock);
        int successes = 0, eisconn = 0;
        for (int i = 0; i < 8; i++) {
            CHECK(pthread_join(workers[i], NULL) == 0);
            successes += results[i].result == 0; eisconn += results[i].result == -1 && results[i].error == EISCONN;
        }
        if (successes != 1 || eisconn != 7) {
            fprintf(stderr, "CONNECT_WINNERS round=%d successes=%d eisconn=%d\n", round, successes, eisconn); exit(9);
        }
        family(fd, native_unix ? AF_UNIX : AF_INET); echo(fd, "concurrent-connect"); close(fd);
        CHECK(pthread_mutex_destroy(&race.lock) == 0 && pthread_cond_destroy(&race.ready) == 0);
    }
    count_eventually(before, "CONNECT_KEEPERS");
    puts(native_unix ? "UNIX control 20x8 one success/seven EISCONN OK" : "VIRTUAL 20x8 one success/seven EISCONN OK");
}
static void fork_eof(void) {
    int before = fd_count();
    int fd = dial(0), child_to_parent[2], parent_to_child[2];
    CHECK(pipe(child_to_parent) == 0 && pipe(parent_to_child) == 0);
    pid_t child = fork(); CHECK(child >= 0);
    if (child == 0) {
        alarm(8); close(child_to_parent[0]); close(parent_to_child[1]);
        char command; CHECK(read(parent_to_child[0], &command, 1) == 1 && command == 'H');
        usleep(150000); family(fd, AF_INET); echo(fd, "retained-child-client");
        CHECK(fd_count() == before + 4); // Two control pipes, client and its pin.
        CHECK(write(child_to_parent[1], "H", 1) == 1);
        CHECK(read(parent_to_child[0], &command, 1) == 1 && command == 'C');
        CHECK(kernel_call(SYS_close, fd, 0) == 0);
        // No interposed close or socket calls here: only the child worker can
        // reap its pin while this process stays alive on its control pipes.
        count_eventually(before + 2, "FORK_KEEPER_COUNT child");
        CHECK(write(child_to_parent[1], "G", 1) == 1);
        CHECK(read(parent_to_child[0], &command, 1) == 1 && command == 'X');
        close(child_to_parent[1]); close(parent_to_child[0]); exit(0);
    }
    close(child_to_parent[1]); close(parent_to_child[0]);
    char marker[100]; snprintf(marker, sizeof(marker), "fork-eof:%ld:%ld\n", (long)getpid(), (long)child); echo(fd, marker);
    CHECK(kernel_call(SYS_close, fd, 0) == 0);
    CHECK(write(parent_to_child[1], "H", 1) == 1);
    char response; CHECK(read(child_to_parent[0], &response, 1) == 1 && response == 'H');
    CHECK(write(parent_to_child[1], "C", 1) == 1);
    CHECK(read(child_to_parent[0], &response, 1) == 1 && response == 'G');
    count_eventually(before + 2, "FORK_KEEPER_COUNT parent");
    printf("FORK_KEEPERS_GONE parent=%ld child=%ld both_alive\n", (long)getpid(), (long)child); fflush(stdout);
    usleep(500000);
    CHECK(write(parent_to_child[1], "X", 1) == 1);
    close(parent_to_child[1]); close(child_to_parent[0]);
    int status; CHECK(waitpid(child, &status, 0) == child && WIFEXITED(status) && WEXITSTATUS(status) == 0);
    count_eventually(before, "FORK_FINAL_INVENTORY");
    puts("FORK EOF both alive; retained-client control; local pins gone OK");
}
static void *raw_alias_worker(void *input) {
    int anchor = *(int *)input;
    for (int i = 0; i < 100; i++) {
        int alias = kernel_call(SYS_dup, anchor, 0); CHECK(alias >= 0); family(alias, AF_INET);
        CHECK(kernel_call(SYS_close, alias, 0) == 0);
    }
    return NULL;
}
static void raw_alias_race(void) {
    int before = fd_count(), anchor = dial(0); pthread_t workers[8];
    for (int i = 0; i < 8; i++) CHECK(pthread_create(&workers[i], NULL, raw_alias_worker, &anchor) == 0);
    for (int i = 0; i < 8; i++) CHECK(pthread_join(workers[i], NULL) == 0);
    family(anchor, AF_INET); echo(anchor, "raw-alias-anchor");
    CHECK(kernel_call(SYS_close, anchor, 0) == 0);
    count_eventually(before, "RAW_ALIAS_KEEPERS");
    puts("RAW dup/close race 8x100 with live source anchor OK");
}
static _Atomic int cancel_entered, cancel_release;
struct pending_cancel { int fd, native, closing; };
static void *queued_operation(void *input) {
    struct pending_cancel *p = input;
    struct sockaddr_in in = target();
    struct sockaddr_un un = {0}; un.sun_family = AF_UNIX; strcpy(un.sun_path, path);
    un.sun_len = (unsigned char)(offsetof(struct sockaddr_un, sun_path) + strlen(path) + 1);
    atomic_store(&cancel_entered, 1);
    while (!atomic_load(&cancel_release)) {}
    if (p->closing) close(p->fd);
    else if (p->native) connect(p->fd, (struct sockaddr *)&un, un.sun_len);
    else connect(p->fd, (struct sockaddr *)&in, sizeof(in));
    return NULL;
}
static void cancel_timeout(int signal) {
    (void)signal;
    const char text[] = "CANCEL ALARM: progress blocked\n";
    write(STDERR_FILENO, text, sizeof(text) - 1); _exit(88);
}
static void queued_cancel(int native, int closing, int reuse) {
    int before = fd_count();
    struct pending_cancel p = {.fd = socket(native ? AF_UNIX : AF_INET, SOCK_STREAM, 0), .native = native, .closing = closing};
    CHECK(p.fd >= 0);
    atomic_store(&cancel_entered, 0); atomic_store(&cancel_release, 0);
    pthread_t worker; CHECK(pthread_create(&worker, NULL, queued_operation, &p) == 0);
    while (!atomic_load(&cancel_entered)) {}
    CHECK(pthread_cancel(worker) == 0);
    if (reuse) {
        int file = open("/dev/null", O_RDONLY); CHECK(file >= 0);
        CHECK(kernel_call(SYS_dup2, file, p.fd) == p.fd); CHECK(close(file) == 0);
    }
    atomic_store(&cancel_release, 1);
    void *status; CHECK(pthread_join(worker, &status) == 0 && status == PTHREAD_CANCELED);
    fprintf(stderr, "pending cancel join status=PTHREAD_CANCELED; closing fd next\n");
    signal(SIGALRM, cancel_timeout); alarm(3);
    if (reuse) {
        char pathname[1024]; CHECK(fcntl(p.fd, F_GETPATH, pathname) == 0 && strcmp(pathname, "/dev/null") == 0);
    }
    if (!closing && !native && !reuse) {
        // Queued cancellation ran before the kernel connect: the same socket
        // and aliases remain caller-owned and the route must be retryable.
        unconnected(p.fd);
        struct sockaddr_in addr = target(); CHECK(connect(p.fd, (struct sockaddr *)&addr, sizeof(addr)) == 0);
        family(p.fd, AF_INET); echo(p.fd, "cancel-retry");
    }
    close(p.fd);
    int next = dial(0); echo(next, "cancel-maintenance-progress"); close(next);
    count_eventually(before, "CANCEL_KEEPERS");
    alarm(0);
    puts("QUEUED_CANCEL delivered; close/retry/maintenance/destructor progress OK");
}
static void duplicate_minimum(void) {
    struct rlimit limit; CHECK(getrlimit(RLIMIT_NOFILE, &limit) == 0);
    if (limit.rlim_cur < 8192) { CHECK(limit.rlim_max >= 8192); limit.rlim_cur = 8192; CHECK(setrlimit(RLIMIT_NOFILE, &limit) == 0); }
    int before = fd_count(), fd = dial(0);
    int copy = fcntl(fd, F_DUPFD, 4096); CHECK(copy >= 4096); family(copy, AF_INET); CHECK(close(copy) == 0);
    copy = fcntl(fd, F_DUPFD_CLOEXEC, 4096); CHECK(copy >= 4096 && fcntl(copy, F_GETFD) == FD_CLOEXEC);
    family(copy, AF_INET); echo(copy, "fcntl-minimum-4096"); close(copy); close(fd);
    count_eventually(before, "MINIMUM_KEEPERS");
    puts("FCNTL dup requested minimum 4096 preserved OK");
}
static void established_cancel(void) {
    int before = fd_count();
    struct pending_cancel p = {.fd = socket(AF_INET, SOCK_STREAM, 0)}; CHECK(p.fd >= 0);
    atomic_store(&cancel_release, 1);
    pthread_t worker; CHECK(pthread_create(&worker, NULL, queued_operation, &p) == 0);
    void *status; CHECK(pthread_join(worker, &status) == 0 && status == PTHREAD_CANCELED);
    signal(SIGALRM, cancel_timeout); alarm(3);
    family(p.fd, AF_INET); echo(p.fd, "established-cancel-real-peer"); close(p.fd);
    count_eventually(before, "ESTABLISHED_CANCEL_KEEPERS"); alarm(0);
    puts("ESTABLISHED_CANCEL actual kernel peer/selected port preserved OK");
}
int main(int argc, char **argv) {
    CHECK(argc == 3 || argc == 4); port = atoi(argv[1]); path = argv[2];
    if (argc == 4) {
        if (strcmp(argv[3], "preconnect") == 0) { preconnect(0); return 0; }
        if (strcmp(argv[3], "preconnect-fork") == 0) { preconnect(1); return 0; }
        if (strcmp(argv[3], "concurrent") == 0) { concurrent_connect(0); return 0; }
        if (strcmp(argv[3], "unix-control") == 0) { concurrent_connect(1); return 0; }
        if (strcmp(argv[3], "fork-eof") == 0) { fork_eof(); return 0; }
        if (strcmp(argv[3], "raw-race") == 0) { raw_alias_race(); return 0; }
        if (strcmp(argv[3], "cancel-connect") == 0) { queued_cancel(0, 0, 0); return 0; }
        if (strcmp(argv[3], "cancel-close") == 0) { queued_cancel(0, 1, 0); return 0; }
        if (strcmp(argv[3], "cancel-close-reuse") == 0) { queued_cancel(0, 1, 1); return 0; }
        if (strcmp(argv[3], "cancel-unix-control") == 0) { queued_cancel(1, 0, 0); return 0; }
        if (strcmp(argv[3], "cancel-unix-close-control") == 0) { queued_cancel(1, 1, 0); return 0; }
        if (strcmp(argv[3], "dup-minimum") == 0) { duplicate_minimum(); return 0; }
        if (strcmp(argv[3], "cancel-established") == 0) { established_cancel(); return 0; }
        CHECK(0);
    }
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
    char pathname[1024]; CHECK(fcntl(copy, F_GETPATH, pathname) == 0 && strcmp(pathname, "/dev/null") == 0);
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
    count_eventually(before, "FINAL_KEEPERS");
    puts("REGISTRY bounded raw-close churn/reclamation OK");
    puts("FD inventory positive control/final baseline restored OK");
    return 0;
}
