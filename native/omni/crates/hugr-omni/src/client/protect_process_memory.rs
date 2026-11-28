//! Process-local protection for a host holding an Activity custody credential.

pub(crate) fn protect() -> bool {
    let zero: libc::c_ulong = 0;
    // SAFETY: these prctl operations take only integer arguments and act on the calling process.
    unsafe {
        libc::prctl(libc::PR_SET_DUMPABLE, zero, zero, zero, zero) == 0
            && libc::prctl(libc::PR_GET_DUMPABLE, zero, zero, zero, zero) == 0
    }
}
