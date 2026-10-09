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
#include <poll.h>

#define ROUTE_LIMIT 32
#define RECORD_LIMIT 1024
#define FD_LIMIT 65536
#define LEASE_LIMIT 64
#define SCAN_BUDGET 8192
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
    // Selected port and pin-liveness are shared across fork; descriptor
    // ownership stays local. Duplicate Unix paths stay unambiguous.
    _Atomic unsigned *port;
};
// Darwin's extended PIDINFO syscall binds a list request to the recorded
// process unique ID inside the kernel. PIDFDINFO ignores that flag in XNU and
// must never be used for descendant socket inspection.
extern int __proc_info_extended_id(int32_t, int32_t, uint32_t, uint32_t, uint64_t, uint64_t, uintptr_t, int32_t);
extern int close_nocancel(int) __asm__("_close$NOCANCEL");
struct birth {
    unsigned char executable[16];
    uint64_t unique, parent;
    int32_t version, parent_version;
    uint64_t reserved[2];
};
_Static_assert(sizeof(struct birth) == 56, "Darwin process birth ABI");
enum { LEASE_FREE, LEASE_PENDING, LEASE_KNOWN, LEASE_UNKNOWN, LEASE_READY, LEASE_INSPECTING };
struct lease {
    _Atomic unsigned state;
    _Atomic int pid;
    _Atomic uint64_t unique;
    _Atomic uint64_t owner;
};
struct family {
    struct lease leases[LEASE_LIMIT];
    _Atomic unsigned records;
};
static struct family *family;
static uint64_t self_unique;
static int fork_child_scope;
static int guardian[2] = {-1, -1};
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

// POSIX asynchronous cancellation is not generally safe inside libc APIs.
// Defer it while the adapter owns its mutex; restore the caller's mode only
// after unlocking. Blocking close/connect remain real cancellation points.
struct ownership {
    int cancel_type;
    int created;
    struct record *record;
    uint64_t handle;
    unsigned claim;
    int lease;
    int inspected;
};
static struct ownership acquire(void) {
    struct ownership owned = { .created = -1, .lease = -1, .inspected = -1 };
    if (fork_child_scope) return owned;
    pthread_setcanceltype(PTHREAD_CANCEL_DEFERRED, &owned.cancel_type);
    pthread_mutex_lock(&lock);
    return owned;
}
static void release(struct ownership *owned) {
    if (fork_child_scope) return;
    pthread_mutex_unlock(&lock);
    pthread_setcanceltype(owned->cancel_type, NULL);
}

static struct record *lookup(int fd) {
    uint64_t handle = identity(fd);
    if (!handle) return NULL;
    for (unsigned i = 0; i < RECORD_LIMIT; i++) {
        if (records[i].handle != handle) continue;
        if (records[i].keeper >= 0 && identity(records[i].keeper) != handle) return NULL;
        if (records[i].keeper < 0) {
            struct pollfd watch = { .fd = guardian[0], .events = POLLIN };
            if (!atomic_load(records[i].port + 1) || poll(&watch, 1, 0) < 0 || (watch.revents & (POLLHUP | POLLERR | POLLNVAL))) return NULL;
        }
        return &records[i];
    }
    return NULL;
}

// Complete own/registered-birth FD inventories gate reclamation. Socket
// reference facts come only from our stable keeper; every child keeper is
// closed atfork, so internal copies cannot mutually retain a connection.
// Missing inventories/births retain pins. Ordinary close/dup/fcntl-dup are
// serialized. Raw duplication must retain a
// live client anchor until the duplicate is installed; dup versus closing its
// last source without such ownership is an undefined descriptor-use race.
static int guarded_info(struct lease *lease, int call, int flavor, uint64_t arg, void *out, int size) {
    uint64_t unique = atomic_load(&lease->unique);
    if (!unique || atomic_load(&lease->state) != LEASE_KNOWN) { errno = EAGAIN; return -1; }
    if (call != 2 || flavor != PROC_PIDLISTFDS) { errno = EINVAL; return -1; }
    // PIF_COMPARE_UNIQUEID=2; PIDINFO=2, from Darwin proc ABI.
    return __proc_info_extended_id(call, atomic_load(&lease->pid), (uint32_t)flavor, 2, unique, arg, (uintptr_t)out, size);
}
static int inventory_live(struct lease *lease, unsigned *budget) {
    int needed = lease ? guarded_info(lease, 2, PROC_PIDLISTFDS, 0, NULL, 0) : proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, NULL, 0);
    if (needed <= 0 || (size_t)needed >= sizeof(inventory)) return 0;
    int got = lease ? guarded_info(lease, 2, PROC_PIDLISTFDS, 0, inventory, sizeof(inventory)) : proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, inventory, sizeof(inventory));
    if (got <= 0 || (size_t)got >= sizeof(inventory) || got % sizeof(*inventory)) return 0;
    unsigned count = (unsigned)((size_t)got / sizeof(*inventory));
    if (count > *budget) { errno = EAGAIN; return 0; }
    *budget -= count;
    needed = lease ? guarded_info(lease, 2, PROC_PIDLISTFDS, 0, NULL, 0) : proc_pidinfo(getpid(), PROC_PIDLISTFDS, 0, NULL, 0);
    if (needed <= 0 || (size_t)needed >= sizeof(inventory)) return 0;
    return 1;
}
static int prune(void) {
    // No socket can lose its pin between the fork snapshot and birth capture.
    for (unsigned i = 0; i < LEASE_LIMIT; i++) {
        unsigned state = atomic_load(&family->leases[i].state);
        if (state == LEASE_PENDING || state == LEASE_READY || state == LEASE_UNKNOWN || state == LEASE_INSPECTING) return 1;
    }
    unsigned budget = SCAN_BUDGET;
    if (!inventory_live(NULL, &budget)) return 0;
    for (unsigned i = 0; i < LEASE_LIMIT; i++) {
        struct lease *lease = &family->leases[i];
        // The root observer owns the registered tree. A single-threaded child
        // only queries descendants created by its own actual fork returns.
        if (fork_child_scope && atomic_load(&lease->owner) != self_unique) continue;
        unsigned known = LEASE_KNOWN;
        if (!atomic_compare_exchange_strong(&lease->state, &known, LEASE_INSPECTING)) continue;
        struct lease snapshot = { .state = LEASE_KNOWN, .pid = atomic_load(&lease->pid), .unique = atomic_load(&lease->unique) };
        if (!inventory_live(&snapshot, &budget)) {
            if (errno != ESRCH) { atomic_store(&lease->state, LEASE_KNOWN); return 0; }
            // Kernel UID mismatch/death retires this recorded birth only.
            atomic_store(&lease->state, LEASE_FREE);
        } else atomic_store(&lease->state, LEASE_KNOWN);
    }
    for (unsigned i = 0; i < RECORD_LIMIT; i++) {
        if (!records[i].handle) continue;
        if (records[i].keeper >= 0) {
            // Inspect only our stable keeper, under our mutex. Inspecting a
            // child's socket fd while it closes can trigger XNU fo_drain and
            // make a still-live parent's read return EBADF. FD lists take no
            // socket I/O references. After atfork drops every child keeper,
            // PROC_FP_SHARED reflects client aliases, never a keeper cycle.
            struct socket_fdinfo info = {0};
            if (proc_pidfdinfo(getpid(), records[i].keeper, PROC_PIDFDSOCKETINFO, &info, sizeof(info)) != sizeof(info) ||
                info.psi.soi_so != records[i].handle) return 0;
            if (info.pfi.fi_status & PROC_FP_SHARED) continue;
        } else if (atomic_load(records[i].port + 1)) continue;
        // Internal pin disposal is finite bookkeeping, not the caller's
        // blocking operation. Commit removal before restoring cancellation.
        int cancel_state = PTHREAD_CANCEL_DISABLE;
        if (!fork_child_scope) pthread_setcancelstate(PTHREAD_CANCEL_DISABLE, &cancel_state);
        if (records[i].keeper >= 0) {
            atomic_store(records[i].port + 1, 0);
            if (identity(records[i].keeper) == records[i].handle) close_nocancel(records[i].keeper);
            atomic_fetch_sub(&family->records, 1);
        }
        munmap(records[i].port, 2 * sizeof(*records[i].port));
        records[i].handle = 0;
        if (!fork_child_scope) pthread_setcancelstate(cancel_state, NULL);
    }
    return 1;
}

static void cancelled(void *input) {
    struct ownership *owned = input;
    pthread_setcancelstate(PTHREAD_CANCEL_DISABLE, NULL);
    if (owned->lease >= 0) atomic_store(&family->leases[owned->lease].state, LEASE_UNKNOWN);
    if (owned->claim && owned->record->handle == owned->handle) {
        // Cancellation can arrive before the syscall or after it connected.
        // Inspect the pinned socket, never an fd another caller may have reused.
        struct socket_fdinfo info = {0};
        int keeper = owned->record->keeper >= 0 ? owned->record->keeper : owned->inspected;
        if (proc_pidfdinfo(getpid(), keeper, PROC_PIDFDSOCKETINFO, &info, sizeof(info)) == sizeof(info) &&
            info.psi.soi_so == owned->handle && !(info.psi.soi_state & (SOI_S_ISCONNECTED | SOI_S_ISCONNECTING))) {
            struct sockaddr_un peer = {0}; socklen_t size = sizeof(peer);
            if (getpeername(keeper, (struct sockaddr *)&peer, &size) < 0 && errno == ENOTCONN) {
                unsigned claim = owned->claim;
                atomic_compare_exchange_strong(owned->record->port, &claim, 0);
            }
        }
    }
    // Only socket() owns a newly allocated client fd. A canceled close/connect
    // does not transfer caller ownership or justify deleting a foreign fd.
    if (owned->created >= 0 && identity(owned->created) == owned->handle) close(owned->created);
    prune();
    if (!fork_child_scope) pthread_mutex_unlock(&lock);
}

static void *maintain(void *unused) {
    (void)unused;
    // Private worker is stopped and joined by the destructor, never canceled.
    pthread_setcancelstate(PTHREAD_CANCEL_DISABLE, NULL);
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
    if (fork_child_scope) return 1;
    if (maintenance_started) return 1;
    if (pthread_create(&maintenance, NULL, maintain, NULL) != 0) return 0;
    maintenance_started = 1;
    return 1;
}
static void fork_prepare(void) { pthread_mutex_lock(&lock); }
static void fork_parent(void) { pthread_mutex_unlock(&lock); }
static void fork_child(void) {
    // This handler only closes already-planned internal descriptors and
    // unlocks. No allocation, proc queries or child thread acquisition.
    for (unsigned i = 0; i < RECORD_LIMIT; i++) {
        if (!records[i].handle || records[i].keeper < 0) continue;
        close_nocancel(records[i].keeper);
        records[i].keeper = -1;
    }
    if (guardian[1] >= 0) close_nocancel(guardian[1]);
    guardian[1] = -1;
    fork_child_scope = 1;
    maintenance_started = 0;
    pthread_mutex_unlock(&lock);
}
__attribute__((constructor)) static void loaded(void) {
    unsigned count = parse(getenv("ORCHESTRA_TCP_PROXY_ROUTES"));
    if (!count) return;
    struct birth birth = {0};
    if (proc_pidinfo(getpid(), 17, 0, &birth, sizeof(birth)) != sizeof(birth) || !birth.unique) return;
    self_unique = birth.unique;
    family = mmap(NULL, sizeof(*family), PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANON, -1, 0);
    if (family == MAP_FAILED) { family = NULL; return; }
    atomic_init(&family->records, 0);
    for (unsigned i = 0; i < LEASE_LIMIT; i++) {
        atomic_init(&family->leases[i].state, LEASE_FREE);
        atomic_init(&family->leases[i].pid, 0);
        atomic_init(&family->leases[i].unique, 0);
        atomic_init(&family->leases[i].owner, 0);
    }
    if (pipe(guardian) < 0 || fcntl(guardian[0], F_SETFD, FD_CLOEXEC) < 0 || fcntl(guardian[1], F_SETFD, FD_CLOEXEC) < 0 ||
        pthread_atfork(fork_prepare, fork_parent, fork_child) != 0) {
        if (guardian[0] >= 0) close_nocancel(guardian[0]);
        if (guardian[1] >= 0) close_nocancel(guardian[1]);
        munmap(family, sizeof(*family)); family = NULL; return;
    }
    route_count = count;
    pthread_mutex_lock(&lock);
    if (!start_maintenance()) route_count = 0;
    pthread_mutex_unlock(&lock);
}
__attribute__((destructor)) static void unloaded(void) {
    if (!route_count) return;
    if (fork_child_scope) {
        // Darwin child hooks are single-threaded and synchronous. Inherited
        // loans belong to the parent; only child-created local pins close here.
        for (unsigned i = 0; i < RECORD_LIMIT; i++) {
            if (!records[i].handle || records[i].keeper < 0) continue;
            atomic_store(records[i].port + 1, 0);
            if (identity(records[i].keeper) == records[i].handle) close_nocancel(records[i].keeper);
            atomic_fetch_sub(&family->records, 1);
        }
        close_nocancel(guardian[0]);
        return;
    }
    int cancel_state;
    pthread_setcancelstate(PTHREAD_CANCEL_DISABLE, &cancel_state);
    pthread_mutex_lock(&lock);
    stopping = 1;
    pthread_cond_signal(&changed);
    int join = maintenance_started;
    pthread_mutex_unlock(&lock);
    if (join) pthread_join(maintenance, NULL);
    pthread_mutex_lock(&lock);
    for (unsigned i = 0; i < RECORD_LIMIT; i++) {
        if (!records[i].handle) continue;
        atomic_store(records[i].port + 1, 0);
        if (identity(records[i].keeper) == records[i].handle) close(records[i].keeper);
        munmap(records[i].port, 2 * sizeof(*records[i].port));
        atomic_fetch_sub(&family->records, 1);
        records[i].handle = 0;
    }
    pthread_mutex_unlock(&lock);
    close_nocancel(guardian[1]);
    close_nocancel(guardian[0]);
    munmap(family, sizeof(*family));
    pthread_setcancelstate(cancel_state, NULL);
}
static pid_t tracked_fork(void) {
    if (!route_count) return fork();
    struct ownership owned = acquire();
    unsigned slot = 0;
    for (; slot < LEASE_LIMIT; slot++) {
        unsigned free = LEASE_FREE;
        if (atomic_compare_exchange_strong(&family->leases[slot].state, &free, LEASE_PENDING)) break;
    }
    if (slot == LEASE_LIMIT) { release(&owned); errno = ENOBUFS; return -1; }
    struct lease *lease = &family->leases[slot];
    atomic_store(&lease->owner, self_unique);
    atomic_store(&lease->pid, 0); atomic_store(&lease->unique, 0);
    release(&owned);
    // POSIX does not make arbitrary post-fork libc code portable. Only the
    // atfork close/unlock handler above has that claim; the self-birth syscall
    // and client hooks below are measured Darwin-specific operations.
    pid_t result = fork();
    int saved = errno;
    if (result == 0) {
        struct birth birth = {0};
        int valid = proc_pidinfo(getpid(), 17, 0, &birth, sizeof(birth)) == sizeof(birth) && birth.unique && birth.parent == self_unique;
        if (valid) self_unique = birth.unique;
        atomic_store(&lease->pid, getpid());
        atomic_store(&lease->unique, valid ? birth.unique : 0);
        unsigned pending = LEASE_PENDING;
        atomic_compare_exchange_strong(&lease->state, &pending, LEASE_READY);
        while (atomic_load(&lease->state) == LEASE_READY || atomic_load(&lease->state) == LEASE_PENDING) {
            struct pollfd watch = { .fd = guardian[0], .events = POLLIN };
            if (poll(&watch, 1, 1) < 0 || (watch.revents & (POLLHUP | POLLERR | POLLNVAL))) {
                atomic_store(&lease->state, LEASE_UNKNOWN);
                break;
            }
        }
        errno = saved;
        return 0;
    }
    if (result < 0) { atomic_store(&lease->state, LEASE_FREE); errno = saved; return result; }
    owned = acquire();
    owned.lease = (int)slot;
    pthread_cleanup_push(cancelled, &owned);
    for (unsigned waited = 0; waited < 100 && atomic_load(&lease->state) == LEASE_PENDING; waited++) poll(NULL, 0, 1);
    unsigned state = atomic_load(&lease->state);
    // PID authority comes from this actual return and a self-birth report
    // while pruning is held. Missing/late identity never enables PID inspection.
    atomic_store(&lease->state, state == LEASE_READY && atomic_load(&lease->pid) == result && atomic_load(&lease->unique) ? LEASE_KNOWN : LEASE_UNKNOWN);
    owned.lease = -1;
    pthread_cleanup_pop(0);
    release(&owned);
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
    struct ownership owned = acquire();
    struct record *p = lookup(fd);
    if (!p) {
        release(&owned);
        errno = saved;
        return remote ? getpeername(fd, out, size) : getsockname(fd, out, size);
    }
    int route = connected_route(fd, p);
    int error = errno;
    if (route < 0 && (remote || error != ENOTCONN)) {
        release(&owned); errno = error; return -1;
    }
    if (!size || (!out && *size)) { release(&owned); errno = EFAULT; return -1; }
    struct sockaddr_in value = {0};
    value.sin_len = sizeof(value);
    value.sin_family = AF_INET;
    value.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (remote) value.sin_port = htons(routes[route].port);
    socklen_t copied = *size < sizeof(value) ? *size : sizeof(value);
    if (copied) memcpy(out, &value, copied);
    *size = sizeof(value);
    release(&owned);
    errno = saved;
    return 0;
}
static int peer_name(int fd, struct sockaddr *out, socklen_t *size) { return address(fd, out, size, 1); }
static int local_name(int fd, struct sockaddr *out, socklen_t *size) { return address(fd, out, size, 0); }

static int tracked_close(int fd) {
    // dyld can interpose close during libSystem's own malloc initializer,
    // before our constructor. No locks or allocation at that boundary.
    if (!route_count) return close(fd);
    struct ownership owned = acquire();
    int result, saved;
    pthread_cleanup_push(cancelled, &owned);
    result = close(fd);
    saved = errno;
    prune();
    pthread_cleanup_pop(0);
    release(&owned);
    errno = saved;
    return result;
}

static int create_socket(struct ownership *owned) {
    int saved = errno;
    if (!start_maintenance() || !prune()) { errno = EPERM; return -1; }
    unsigned slot = 0;
    while (slot < RECORD_LIMIT && records[slot].handle) slot++;
    if (slot == RECORD_LIMIT) { errno = ENOBUFS; return -1; }
    unsigned count = atomic_load(&family->records);
    do {
        if (count >= RECORD_LIMIT) { errno = ENOBUFS; return -1; }
    } while (!atomic_compare_exchange_weak(&family->records, &count, count + 1));
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    int keeper = -1;
    uint64_t handle = 0;
    _Atomic unsigned *port = MAP_FAILED;
    if (fd < 0) goto fail;
    keeper = fcntl(fd, F_DUPFD_CLOEXEC, 0);
    if (keeper < 0) goto fail;
    handle = identity(fd);
    if (!handle) { errno = EPERM; goto fail; }
    port = mmap(NULL, 2 * sizeof(*port), PROT_READ | PROT_WRITE, MAP_SHARED | MAP_ANON, -1, 0);
    if (port == MAP_FAILED) goto fail;
    atomic_init(port, 0);
    atomic_init(port + 1, 1);
    records[slot] = (struct record){ .handle = handle, .keeper = keeper, .port = port };
    owned->created = fd;
    owned->handle = handle;
    errno = saved;
    return fd;
fail:
    {
        int error = errno;
        if (fd >= 0) close(fd);
        if (keeper >= 0) close(keeper);
        if (port != MAP_FAILED) munmap(port, 2 * sizeof(*port));
        atomic_fetch_sub(&family->records, 1);
        errno = error; return -1;
    }
}

static int tracked_socket(int family, int type, int protocol) {
    if (!route_count || family != AF_INET || type != SOCK_STREAM || (protocol != 0 && protocol != IPPROTO_TCP))
        return socket(family, type, protocol);
    struct ownership owned = acquire();
    int result, saved, cancel_state;
    pthread_cleanup_push(cancelled, &owned);
    // Protect fd/keeper/mapping publication and allocation-failure cleanup.
    // This bounded section contains no connect, accept or blocking I/O.
    pthread_setcancelstate(PTHREAD_CANCEL_DISABLE, &cancel_state);
    result = create_socket(&owned);
    saved = errno;
    pthread_setcancelstate(cancel_state, NULL);
    pthread_cleanup_pop(0);
    release(&owned);
    errno = saved;
    return result;
}

static int tracked_bind(int fd, const struct sockaddr *addr, socklen_t len) {
    if (!route_count) return bind(fd, addr, len);
    int saved = errno;
    struct ownership owned = acquire();
    int virtual = lookup(fd) != NULL;
    release(&owned);
    if (virtual) { errno = EPERM; return -1; }
    errno = saved;
    return bind(fd, addr, len);
}

static int tracked_dup(int fd) {
    if (!route_count) return dup(fd);
    struct ownership owned = acquire();
    int result, saved;
    pthread_cleanup_push(cancelled, &owned);
    result = dup(fd); saved = errno;
    pthread_cleanup_pop(0);
    release(&owned);
    errno = saved;
    return result;
}
static int tracked_dup2(int fd, int dest) {
    if (!route_count) return dup2(fd, dest);
    struct ownership owned = acquire();
    int result, saved;
    pthread_cleanup_push(cancelled, &owned);
    result = dup2(fd, dest); saved = errno;
    prune();
    pthread_cleanup_pop(0);
    release(&owned);
    errno = saved;
    return result;
}
__attribute__((used, noinline)) static int dup_fcntl(int fd, int command, int minimum) {
    if (!route_count) return fcntl(fd, command, minimum);
    struct ownership owned = acquire();
    int result, saved;
    pthread_cleanup_push(cancelled, &owned);
    result = fcntl(fd, command, minimum); saved = errno;
    pthread_cleanup_pop(0);
    release(&owned);
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
    // Darwin arm64 variadic arguments start at the caller's stack pointer;
    // dup_fcntl has a fixed signature and consumes its third argument in w2.
    __asm__("cmp w1, #0\n b.eq 1f\n cmp w1, #67\n b.eq 1f\n b _fcntl\n 1: ldr w2, [sp]\n b _dup_fcntl");
#else
#error Unsupported Darwin fcntl ABI
#endif
}

static int connect_socket(int fd, const struct sockaddr *addr, socklen_t len, struct ownership *owned) {
    int saved = errno;
    struct record *p = lookup(fd);
    if (!p) { errno = ENOTSOCK; return -1; }
    if (!addr || len < sizeof(struct sockaddr_in) || addr->sa_family != AF_INET) goto denied;
    const struct sockaddr_in *in = (const struct sockaddr_in *)addr;
    if (in->sin_addr.s_addr != htonl(INADDR_LOOPBACK)) goto denied;
    unsigned route = 0;
    while (route < route_count && routes[route].port != ntohs(in->sin_port)) route++;
    if (route == route_count) goto denied;
    struct sockaddr_un peer = {0};
    socklen_t size = sizeof(peer);
    if (getpeername(fd, (struct sockaddr *)&peer, &size) == 0) {
        errno = EISCONN; return -1;
    }
    if (errno != ENOTCONN) return -1;
    // Publish the route before the kernel makes the shared socket connected:
    // another process can query its peer before this connect call returns.
    // The claim also serializes competing parent/child connects after fork.
    unsigned unclaimed = 0;
    if (!atomic_compare_exchange_strong(p->port, &unclaimed, routes[route].port)) {
        errno = EISCONN; return -1;
    }
    owned->record = p;
    owned->handle = p->handle;
    owned->claim = routes[route].port;
    owned->inspected = fd;
    // Connect the socket created at socket(), never replace a single alias.
    int result = connect(fd, (const struct sockaddr *)&routes[route].peer, routes[route].peer.sun_len);
    int error = result < 0 ? errno : saved;
    if (result < 0 && error != EINPROGRESS) atomic_store(p->port, 0);
    errno = error;
    return result;
denied:
    errno = EPERM; return -1;
}
static int redirected_connect(int fd, const struct sockaddr *addr, socklen_t len) {
    if (!route_count) return connect(fd, addr, len);
    int saved = errno;
    struct ownership owned = acquire();
    if (!lookup(fd)) { release(&owned); errno = saved; return connect(fd, addr, len); }
    int result;
    pthread_cleanup_push(cancelled, &owned);
    result = connect_socket(fd, addr, len, &owned);
    saved = errno;
    pthread_cleanup_pop(0);
    release(&owned);
    errno = saved;
    return result;
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
