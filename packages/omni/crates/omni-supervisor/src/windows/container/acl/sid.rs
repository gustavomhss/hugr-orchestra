//! The SIDs a container runs with: its profile's and the toolchain capability's. Split from `acl.rs` to keep each file
//! under omni's size limit.

use std::io;

use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::{DeriveCapabilitySidsFromName, FreeSid, PSID};

use super::super::wide;

/// A profile's SID (freed with FreeSid) or a capability's (LocalFree), freed on drop.
pub(in super::super) struct Sid(pub(super) PSID, pub(super) bool);

impl Sid {
    pub(in super::super) fn raw(&self) -> PSID {
        self.0
    }
}

impl Drop for Sid {
    fn drop(&mut self) {
        // SAFETY: a SID from CreateAppContainerProfile or DeriveAppContainerSidFromAppContainerName (FreeSid), or one
        // DeriveCapabilitySidsFromName allocated (LocalFree).
        unsafe {
            if self.1 {
                LocalFree(self.0);
            } else {
                FreeSid(self.0);
            }
        }
    }
}

/// The SID of the named custom capability. Every Orchestra container holds it, so a toolchain grant made to it once
/// serves every profile and no other principal: an AppContainer passes the access check on an ACE for a capability its
/// token holds. A capability that names no network service adds no network.
pub(in super::super) fn capability(name: &str) -> io::Result<Sid> {
    let name = wide(name);
    let (mut groups, mut group_count, mut sids, mut count) = (std::ptr::null_mut(), 0u32, std::ptr::null_mut(), 0u32);
    // SAFETY: a NUL-terminated name and out pointers for two LocalAlloc'd arrays of LocalAlloc'd SIDs.
    if unsafe { DeriveCapabilitySidsFromName(name.as_ptr(), &mut groups, &mut group_count, &mut sids, &mut count) } == 0
    {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the arrays and their SIDs came from the call above; only the first capability SID is kept.
    unsafe {
        for index in 0..group_count as usize {
            LocalFree(*groups.add(index));
        }
        LocalFree(groups.cast());
        for index in 1..count as usize {
            LocalFree(*sids.add(index));
        }
        let first = if count > 0 { *sids } else { std::ptr::null_mut() };
        LocalFree(sids.cast());
        if first.is_null() {
            return Err(io::Error::other("no capability SID"));
        }
        Ok(Sid(first, true))
    }
}
