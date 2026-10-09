#include <fcntl.h>
#include <sys/types.h>

/* The SDK declaration is variadic: Apple ARM64 places mode on the stack.
 * Bun binds only this fixed-signature entry, never a cast of openat itself. */
int orchestra_artifact_openat(int parent, const char *name, int flags, unsigned int mode) {
  return openat(parent, name, flags, (mode_t)mode);
}
