export * as TcpProxyNative from "./tcp-proxy-native"

export const ROUTES = "ORCHESTRA_TCP_PROXY_ROUTES"

// Darwin-only, per-child interposer. Seatbelt grants only the broker's Unix
// sockets; this code grants no kernel network authority. The broker, not this
// environment map or the child, owns each immutable upstream destination.
export const SOURCE = String.raw`
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/mman.h>
#include <netinet/in.h>
#include <libproc.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
#include <stdint.h>
#include <pthread.h>
#include <stdatomic.h>
#include <time.h>

#define ROUTE_LIMIT 32
#define RECORD_LIMIT 1024
#define FD_LIMIT 65536
#define PATH_LIMIT sizeof(((struct sockaddr_un *)0)->sun_path)
#define CONFIG_LIMIT (ROUTE_LIMIT * (7 + 2 * (PATH_LIMIT - 1)))
_Static_assert(ATOMIC_INT_LOCK_FREE == 2, "fork-shared route state must be lock-free");

struct route {
    uint16_t port;
    struct sockaddr_un peer;
};
struct record {
    uint64_t handle;
    int keeper;
    // Only the selected port is shared across fork. Descriptor ownership and
    // reclamation remain process-local. Duplicate Unix paths stay unambiguous.
    _Atomic unsigned *port;
};
static struct route routes[ROUTE_LIMIT];
static unsigned route_count;
static struct record records[RECORD_LIMIT];
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t changed = PTHREAD_COND_INITIALIZER;
static pthread_t maintenance;
static int maintenance_started, stopping;
static struct proc_fdinfo inventory[FD_LIMIT];

static int hex(unsigned char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

// Reject invalid UTF-8, overlong sequences, surrogates and embedded NULs.
static int utf8(const unsigned char *s, size_t n) {
    for (size_t i = 0; i < n;) {
        unsigned char c = s[i++];
        if (c == 0) return 0;
        if (c < 0x80) continue;
        unsigned count;
        uint32_t value, minimum;
        if (c >= 0xc2 && c <= 0xdf) { count = 1; value = c & 31; minimum = 0x80; }
        else if (c >= 0xe0 && c <= 0xef) { count = 2; value = c & 15; minimum = 0x800; }
        else if (c >= 0xf0 && c <= 0xf4) { count = 3; value = c & 7; minimum = 0x10000; }
        else return 0;
        if (n - i < count) return 0;
        while (count--) {
            c = s[i++];
            if ((c & 0xc0) != 0x80) return 0;
            value = (value << 6) | (c & 63);
        }
        if (value < minimum || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return 0;
    }
    return 1;
}

static unsigned parse(const char *s) {
    if (!s || !*s || strnlen(s, CONFIG_LIMIT + 1) > CONFIG_LIMIT) return 0;
    unsigned count = 0;
    while (*s) {
        if (count == ROUTE_LIMIT) return 0;
        unsigned port = 0, digits = 0;
        while (*s >= '0' && *s <= '9') {
            if (++digits > 5) return 0;
            port = port * 10 + (unsigned)(*s++ - '0');
        }
        if (!digits || !port || port > 65535 || *s++ != ':') return 0;
        for (unsigned i = 0; i < count; i++) if (routes[i].port == port) return 0;
        struct sockaddr_un peer = {0};
        size_t n = 0;
        while (*s && *s != ';') {
            int hi = hex((unsigned char)*s++);
            if (hi < 0 || !*s || *s == ';') return 0;
            int lo = hex((unsigned char)*s++);
            if (lo < 0 || n == PATH_LIMIT - 1) return 0;
            peer.sun_path[n++] = (char)((hi << 4) | lo);
        }
        if (!n || peer.sun_path[0] != '/' || !utf8((const unsigned char *)peer.sun_path, n)) return 0;
        peer.sun_family = AF_UNIX;
        peer.sun_len = (unsigned char)(offsetof(struct sockaddr_un, sun_path) + n + 1);
        routes[count].port = (uint16_t)port;
        routes[count++].peer = peer;
        if (*s == ';' && !*++s) return 0;
    }
    return count;
}

static uint64_t identity(int fd) {
    struct socket_fdinfo info = {0};
    if (proc_pidfdinfo(getpid(), fd, PROC_PIDFDSOCKETINFO, &info, sizeof(info)) != sizeof(info)) return 0;
    return info.psi.soi_so;
}

static struct record *lookup(int fd) {
    uint64_t handle = identity(fd);
    if (!handle) return NULL;
    for (unsigned i = 0; i < RECORD_LIMIT; i++) {
        if (records[i].handle != handle) continue;
        if (identity(records[i].keeper) != handle) return NULL;
        return &records[i];
    }
    return NULL;
}

// Only a complete local FD inventory can justify releasing a pin. Global
// fileglob reference counts include other processes' keepers and deadlock EOF
// after fork. Every internal keeper is excluded, even for another entry.
// Ordinary close/dup/fcntl-dup are serialized. Raw duplication must retain a
// live client anchor until the duplicate is installed; dup versus closing its
// last source without such ownership is an undefined descriptor-use race.
static int prune(void) {
    int needed = proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, NULL, 0);
    if (needed <= 0 || (size_t)needed >= sizeof(inventory)) return 0;
    int got = proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, inventory, sizeof(inventory));
    if (got <= 0 || (size_t)got >= sizeof(inventory) || got % sizeof(*inventory)) return 0;
    needed = proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, NULL, 0);
    if (needed <= 0 || (size_t)needed >= sizeof(inventory)) return 0;
    unsigned char live[RECORD_LIMIT] = {0};
    for (size_t i = 0; i < (size_t)got / sizeof(*inventory); i++) {
        if (inventory[i].proc_fdtype != PROX_FDTYPE_SOCKET) continue;
        int fd = inventory[i].proc_fd;
        unsigned j = 0;
        while (j < RECORD_LIMIT && (!records[j].handle || records[j].keeper != fd)) j++;
        if (j < RECORD_LIMIT) continue;
        uint64_t handle = identity(fd);
        // A racing raw close invalidates this snapshot; retry next tick.
        if (!handle) return 0;
        for (j = 0; j < RECORD_LIMIT; j++) if (records[j].handle == handle) live[j] = 1;
    }
    for (unsigned i = 0; i < RECORD_LIMIT; i++) {
        if (!records[i].handle || live[i]) continue;
        if (identity(records[i].keeper) == records[i].handle) close(records[i].keeper);
        munmap(records[i].port, sizeof(*records[i].port));
        records[i].handle = 0;
    }
    return 1;
}

static void *maintain(void *unused) {
    (void)unused;
    pthread_mutex_lock(&lock);
    while (!stopping) {
        prune();
        // Relative Darwin wait remains bounded across wall-clock corrections.
        struct timespec delay = { .tv_sec = 0, .tv_nsec = 50000000 };
        pthread_cond_timedwait_relative_np(&changed, &lock, &delay);
    }
    pthread_mutex_unlock(&lock);
    return NULL;
}
static int start_maintenance(void) {
    if (maintenance_started) return 1;
    if (pthread_create(&maintenance, NULL, maintain, NULL) != 0) return 0;
    maintenance_started = 1;
    return 1;
}
static void fork_prepare(void) { pthread_mutex_lock(&lock); }
static void fork_parent(void) { pthread_mutex_unlock(&lock); }
static void fork_child(void) {
    // No thread creation or allocation inside the atfork handler. The fork
    // interposer restarts this process's worker after libc fork returns.
    maintenance_started = 0;
    changed = (pthread_cond_t)PTHREAD_COND_INITIALIZER;
    pthread_mutex_unlock(&lock);
}
__attribute__((constructor)) static void loaded(void) {
    route_count = parse(getenv("ORCHESTRA_TCP_PROXY_ROUTES"));
    if (!route_count) return;
    if (pthread_atfork(fork_prepare, fork_parent, fork_child) != 0) { route_count = 0; return; }
    pthread_mutex_lock(&lock);
    if (!start_maintenance()) route_count = 0;
    pthread_mutex_unlock(&lock);
}
__attribute__((destructor)) static void unloaded(void) {
    if (!route_count) return;
    pthread_mutex_lock(&lock);
    stopping = 1;
    pthread_cond_signal(&changed);
    int join = maintenance_started;
    pthread_mutex_unlock(&lock);
    if (join) pthread_join(maintenance, NULL);
    pthread_mutex_lock(&lock);
    for (unsigned i = 0; i < RECORD_LIMIT; i++) {
        if (!records[i].handle) continue;
        if (identity(records[i].keeper) == records[i].handle) close(records[i].keeper);
        munmap(records[i].port, sizeof(*records[i].port));
        records[i].handle = 0;
    }
    pthread_mutex_unlock(&lock);
}
static pid_t tracked_fork(void) {
    pid_t result = fork();
    int saved = errno;
    if (route_count) {
        pthread_mutex_lock(&lock);
        int ready = start_maintenance();
        pthread_mutex_unlock(&lock);
        // A child cannot keep inherited pins alive without its own reaper.
        // Thread acquisition failure terminates that child rather than
        // silently returning a fork with broken EOF/resource ownership.
        if (result == 0 && !ready) _exit(127);
    }
    errno = saved;
    return result;
}

// Validate the actual Unix peer on every connected address query. Shared port
// metadata identifies the exact route when several ports use the same path.
static int connected_route(int fd, struct record *p) {
    struct sockaddr_un peer = {0};
    socklen_t size = sizeof(peer);
    if (getpeername(fd, (struct sockaddr *)&peer, &size) < 0) return -1;
    unsigned port = atomic_load(p->port);
    for (unsigned i = 0; i < route_count; i++) {
        const struct sockaddr_un *expected = &routes[i].peer;
        size_t n = strlen(expected->sun_path);
        if (port && routes[i].port != port) continue;
        if (peer.sun_family == AF_UNIX && size >= offsetof(struct sockaddr_un, sun_path) + n &&
            size <= sizeof(peer) && strnlen(peer.sun_path, PATH_LIMIT) == n &&
            memcmp(peer.sun_path, expected->sun_path, n) == 0) return (int)i;
    }
    errno = EPERM;
    return -1;
}

static int address(int fd, struct sockaddr *out, socklen_t *size, int remote) {
    if (!route_count) return remote ? getpeername(fd, out, size) : getsockname(fd, out, size);
    int saved = errno;
    pthread_mutex_lock(&lock);
    struct record *p = lookup(fd);
    if (!p) {
        pthread_mutex_unlock(&lock);
        errno = saved;
        return remote ? getpeername(fd, out, size) : getsockname(fd, out, size);
    }
    int route = connected_route(fd, p);
    int error = errno;
    if (route < 0 && (remote || error != ENOTCONN)) {
        pthread_mutex_unlock(&lock); errno = error; return -1;
    }
    if (!size || (!out && *size)) { pthread_mutex_unlock(&lock); errno = EFAULT; return -1; }
    struct sockaddr_in value = {0};
    value.sin_len = sizeof(value);
    value.sin_family = AF_INET;
    value.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (remote) value.sin_port = htons(routes[route].port);
    socklen_t copied = *size < sizeof(value) ? *size : sizeof(value);
    if (copied) memcpy(out, &value, copied);
    *size = sizeof(value);
    pthread_mutex_unlock(&lock);
    errno = saved;
    return 0;
}
static int peer_name(int fd, struct sockaddr *out, socklen_t *size) { return address(fd, out, size, 1); }
static int local_name(int fd, struct sockaddr *out, socklen_t *size) { return address(fd, out, size, 0); }

static int tracked_close(int fd) {
    // dyld can interpose close during libSystem's own malloc initializer,
    // before our constructor. No locks or allocation at that boundary.
    if (!route_count) return close(fd);
    pthread_mutex_lock(&lock);
    int result = close(fd);
    int saved = errno;
    prune();
    pthread_mutex_unlock(&lock);
    errno = saved;
    return result;
}

static int tracked_socket(int family, int type, int protocol) {
    if (!route_count || family != AF_INET || type != SOCK_STREAM || (protocol != 0 && protocol != IPPROTO_TCP))
        return socket(family, type, protocol);
    int saved = errno;
    pthread_mutex_lock(&lock);
    if (!start_maintenance() || !prune()) { pthread_mutex_unlock(&lock); errno = EPERM; return -1; }
    unsigned slot = 0;
    while (slot < RECORD_LIMIT && records[slot].handle) slot++;
    if (slot == RECORD_LIMIT) { pthread_mutex_unlock(&lock); errno = ENOBUFS; return -1; }
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    int keeper = -1;
    uint64_t handle = 0;
    _Atomic unsigned *port = MAP_FAILED;
    if (fd < 0) goto fail;
    keeper = fcntl(fd, F_DUPFD_CLOEXEC, 0);
    if (keeper < 0) goto fail;
    handle = identity(fd);
    if (!handle) { errno = EPERM; goto fail; }
    port = mmap(NULL, sizeof(*port), PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANON, -1, 0);
    if (port == MAP_FAILED) goto fail;
    atomic_init(port, 0);
    records[slot] = (struct record){ .handle = handle, .keeper = keeper, .port = port };
    pthread_mutex_unlock(&lock);
    errno = saved;
    return fd;
fail:
    {
        int error = errno;
        if (fd >= 0) close(fd);
        if (keeper >= 0) close(keeper);
        if (port != MAP_FAILED) munmap(port, sizeof(*port));
        pthread_mutex_unlock(&lock); errno = error; return -1;
    }
}

static int tracked_bind(int fd, const struct sockaddr *addr, socklen_t len) {
    if (!route_count) return bind(fd, addr, len);
    int saved = errno;
    pthread_mutex_lock(&lock);
    int virtual = lookup(fd) != NULL;
    pthread_mutex_unlock(&lock);
    if (virtual) { errno = EPERM; return -1; }
    errno = saved;
    return bind(fd, addr, len);
}

static int tracked_dup(int fd) {
    if (!route_count) return dup(fd);
    pthread_mutex_lock(&lock);
    int result = dup(fd), saved = errno;
    pthread_mutex_unlock(&lock);
    errno = saved;
    return result;
}
static int tracked_dup2(int fd, int dest) {
    if (!route_count) return dup2(fd, dest);
    pthread_mutex_lock(&lock);
    int result = dup2(fd, dest), saved = errno;
    prune();
    pthread_mutex_unlock(&lock);
    errno = saved;
    return result;
}
__attribute__((used, noinline)) static int dup_fcntl(int fd, int command, int minimum) {
    if (!route_count) return fcntl(fd, command, minimum);
    pthread_mutex_lock(&lock);
    int result = fcntl(fd, command, minimum), saved = errno;
    pthread_mutex_unlock(&lock);
    errno = saved;
    return result;
}
// Darwin ABI tail-dispatch: preserve all arguments for every non-dup command,
// including getters with no third argument and filesystem-specific pointers.
// Only the two closed integer-argument dup commands enter the mutex boundary.
_Static_assert(F_DUPFD == 0 && F_DUPFD_CLOEXEC == 67, "Darwin fcntl dup ABI");
__attribute__((naked)) static int tracked_fcntl(int fd __attribute__((unused)), int command __attribute__((unused)), ...) {
#if defined(__x86_64__)
    __asm__("cmpl $0, %esi\n je 1f\n cmpl $67, %esi\n je 1f\n jmp _fcntl\n 1: jmp _dup_fcntl");
#elif defined(__aarch64__)
    __asm__("cmp w1, #0\n b.eq 1f\n cmp w1, #67\n b.eq 1f\n b _fcntl\n 1: b _dup_fcntl");
#else
#error Unsupported Darwin fcntl ABI
#endif
}

static int redirected_connect(int fd, const struct sockaddr *addr, socklen_t len) {
    int saved = errno;
    if (!route_count) return connect(fd, addr, len);
    pthread_mutex_lock(&lock);
    struct record *p = lookup(fd);
    if (!p) { pthread_mutex_unlock(&lock); errno = saved; return connect(fd, addr, len); }
    if (!addr || len < sizeof(struct sockaddr_in) || addr->sa_family != AF_INET) goto denied;
    const struct sockaddr_in *in = (const struct sockaddr_in *)addr;
    if (in->sin_addr.s_addr != htonl(INADDR_LOOPBACK)) goto denied;
    unsigned route = 0;
    while (route < route_count && routes[route].port != ntohs(in->sin_port)) route++;
    if (route == route_count) goto denied;
    struct sockaddr_un peer = {0};
    socklen_t size = sizeof(peer);
    if (getpeername(fd, (struct sockaddr *)&peer, &size) == 0) {
        pthread_mutex_unlock(&lock); errno = EISCONN; return -1;
    }
    if (errno != ENOTCONN) { int error = errno; pthread_mutex_unlock(&lock); errno = error; return -1; }
    // Publish the route before the kernel makes the shared socket connected:
    // another process can query its peer before this connect call returns.
    // The claim also serializes competing parent/child connects after fork.
    unsigned unclaimed = 0;
    if (!atomic_compare_exchange_strong(p->port, &unclaimed, routes[route].port)) {
        pthread_mutex_unlock(&lock); errno = EISCONN; return -1;
    }
    // Connect the socket created at socket(), never replace a single alias.
    int result = connect(fd, (const struct sockaddr *)&routes[route].peer, routes[route].peer.sun_len);
    int error = result < 0 ? errno : saved;
    if (result < 0 && error != EINPROGRESS) atomic_store(p->port, 0);
    pthread_mutex_unlock(&lock);
    errno = error;
    return result;
denied:
    pthread_mutex_unlock(&lock); errno = EPERM; return -1;
}

#define ENTRY(replacement, original) { (const void *)(replacement), (const void *)(original) }
__attribute__((used, section("__DATA,__interpose")))
static const struct { const void *replacement; const void *original; } interpose[] = {
    ENTRY(redirected_connect, connect), ENTRY(peer_name, getpeername),
    ENTRY(local_name, getsockname), ENTRY(tracked_close, close), ENTRY(tracked_socket, socket),
    ENTRY(tracked_bind, bind), ENTRY(tracked_dup, dup), ENTRY(tracked_dup2, dup2),
    ENTRY(tracked_fcntl, fcntl), ENTRY(tracked_fork, fork)
};
`
