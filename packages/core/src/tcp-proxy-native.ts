export * as TcpProxyNative from "./tcp-proxy-native"

export const ROUTES = "ORCHESTRA_TCP_PROXY_ROUTES"

// Darwin-only, per-child interposer. Seatbelt grants only the broker's Unix
// sockets; this code grants no kernel network authority. The broker, not this
// environment map or the child, owns each immutable upstream destination.
export const SOURCE = String.raw`
#include <sys/socket.h>
#include <sys/un.h>
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

#define ROUTE_LIMIT 32
#define RECORD_LIMIT 1024
#define PATH_LIMIT sizeof(((struct sockaddr_un *)0)->sun_path)
#define CONFIG_LIMIT (ROUTE_LIMIT * (7 + 2 * (PATH_LIMIT - 1)))

struct route {
    uint16_t port;
    struct sockaddr_un peer;
};
struct record {
    uint64_t handle;
    int keeper;
    unsigned route;
    struct sockaddr_in remote;
};
static struct route routes[ROUTE_LIMIT];
static unsigned route_count;
static struct record records[RECORD_LIMIT];
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;

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

static void fork_prepare(void) { pthread_mutex_lock(&lock); }
static void fork_release(void) { pthread_mutex_unlock(&lock); }
__attribute__((constructor)) static void loaded(void) {
    // Freeze one key once. A malformed suffix disables the entire map.
    route_count = parse(getenv("ORCHESTRA_TCP_PROXY_ROUTES"));
    if (pthread_atfork(fork_prepare, fork_release, fork_release) != 0) route_count = 0;
}

static uint64_t identity(int fd) {
    struct socket_fdinfo info = {0};
    if (proc_pidfdinfo(getpid(), fd, PROC_PIDFDSOCKETINFO, &info, sizeof(info)) != sizeof(info)) return 0;
    return info.psi.soi_so;
}

// Entries follow the kernel socket, not the descriptor: dup, dup2, fcntl dup
// and raw-syscall aliases retain addresses, even after the original fd closes.
// Real peer validation isolates unrelated direct Unix sockets to the same path.
static struct record *lookup(int fd) {
    uint64_t handle = identity(fd);
    if (!handle) return NULL;
    for (unsigned i = 0; i < RECORD_LIMIT; i++) {
        if (records[i].handle != handle) continue;
        struct sockaddr_un peer = {0};
        socklen_t size = sizeof(peer);
        const struct sockaddr_un *expected = &routes[records[i].route].peer;
        size_t n = strlen(expected->sun_path);
        if (getpeername(fd, (struct sockaddr *)&peer, &size) < 0 || peer.sun_family != AF_UNIX ||
            size < offsetof(struct sockaddr_un, sun_path) + n ||
            size > sizeof(peer) || strnlen(peer.sun_path, PATH_LIMIT) != n ||
            memcmp(peer.sun_path, expected->sun_path, n) != 0) return NULL;
        return &records[i];
    }
    return NULL;
}

// soi_so can recycle after the last reference closes. Each entry pins its
// kernel socket with an internal CLOEXEC duplicate. PROC_FP_SHARED is the OS's
// fileglob reference fact: a lone keeper has no client aliases left. This also
// handles raw close/dup and fcntl duplication without a variadic fcntl shim.
// Failed inspection retains the pin, never confuses a recycled Unix socket.
static void prune(void) {
    for (unsigned i = 0; i < RECORD_LIMIT; i++) {
        if (!records[i].handle) continue;
        struct socket_fdinfo info = {0};
        if (proc_pidfdinfo(getpid(), records[i].keeper, PROC_PIDFDSOCKETINFO, &info, sizeof(info)) != sizeof(info)) continue;
        if (info.psi.soi_so != records[i].handle) { records[i].handle = 0; continue; }
        if (info.pfi.fi_status & PROC_FP_SHARED) continue;
        close(records[i].keeper);
        records[i].handle = 0;
    }
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
    if (!size || (!out && *size)) { pthread_mutex_unlock(&lock); errno = EFAULT; return -1; }
    struct sockaddr_in value = p->remote;
    if (!remote) value.sin_port = 0;
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

static int redirected_connect(int fd, const struct sockaddr *addr, socklen_t len) {
    int saved = errno;
    if (!route_count || !addr || len < sizeof(struct sockaddr_in) || addr->sa_family != AF_INET)
        return connect(fd, addr, len);
    const struct sockaddr_in *in = (const struct sockaddr_in *)addr;
    if (in->sin_addr.s_addr != htonl(INADDR_LOOPBACK)) return connect(fd, addr, len);
    unsigned route = 0;
    while (route < route_count && routes[route].port != ntohs(in->sin_port)) route++;
    if (route == route_count) return connect(fd, addr, len);
    int type = 0;
    socklen_t size = sizeof(type);
    struct sockaddr_storage local = {0};
    socklen_t local_size = sizeof(local);
    if (getsockopt(fd, SOL_SOCKET, SO_TYPE, &type, &size) < 0 || type != SOCK_STREAM ||
        getsockname(fd, (struct sockaddr *)&local, &local_size) < 0 || local.ss_family != AF_INET) {
        errno = saved;
        return connect(fd, addr, len);
    }
    pthread_mutex_lock(&lock);
    prune();
    unsigned slot = 0;
    while (slot < RECORD_LIMIT && records[slot].handle) slot++;
    if (slot == RECORD_LIMIT) { pthread_mutex_unlock(&lock); errno = ENOBUFS; return -1; }
    int flags = fcntl(fd, F_GETFL);
    int fdflags = fcntl(fd, F_GETFD);
    int unixfd = socket(AF_UNIX, SOCK_STREAM, 0);
    int keeper = -1;
    int result = -1, error = 0;
    uint64_t handle = 0;
    if (flags < 0 || fdflags < 0 || unixfd < 0 || fcntl(unixfd, F_SETFL, flags) < 0) goto fail;
    result = connect(unixfd, (const struct sockaddr *)&routes[route].peer, routes[route].peer.sun_len);
    error = result < 0 ? errno : saved;
    if (result < 0 && error != EINPROGRESS) goto fail;
    handle = identity(unixfd);
    if (!handle) { errno = ENOTSOCK; goto fail; }
    keeper = fcntl(unixfd, F_DUPFD_CLOEXEC, 0);
    if (keeper < 0) goto fail;
    if (dup2(unixfd, fd) < 0 || fcntl(fd, F_SETFD, fdflags) < 0) goto fail;
    records[slot].route = route;
    records[slot].keeper = keeper;
    memset(&records[slot].remote, 0, sizeof(records[slot].remote));
    records[slot].remote.sin_len = sizeof(struct sockaddr_in);
    records[slot].remote.sin_family = AF_INET;
    records[slot].remote.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    records[slot].remote.sin_port = in->sin_port;
    records[slot].handle = handle;
    close(unixfd);
    pthread_mutex_unlock(&lock);
    errno = error;
    return result;
fail:
    error = errno;
    if (unixfd >= 0) close(unixfd);
    if (keeper >= 0) close(keeper);
    pthread_mutex_unlock(&lock);
    errno = error;
    return -1;
}

#define ENTRY(replacement, original) { (const void *)(replacement), (const void *)(original) }
__attribute__((used, section("__DATA,__interpose")))
static const struct { const void *replacement; const void *original; } interpose[] = {
    ENTRY(redirected_connect, connect), ENTRY(peer_name, getpeername),
    ENTRY(local_name, getsockname), ENTRY(tracked_close, close)
};
`
