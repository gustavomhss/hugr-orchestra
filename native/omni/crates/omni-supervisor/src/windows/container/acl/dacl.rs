//! A path's DACL read through its name, split from `acl.rs` to keep each file under omni's size limit.

use std::io;
use std::path::Path;

use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Authorization::{
    EXPLICIT_ACCESS_W, GetNamedSecurityInfoW, NO_MULTIPLE_TRUSTEE, SE_FILE_OBJECT, SetEntriesInAclW,
    SetNamedSecurityInfoW, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
use windows_sys::Win32::Security::{
    ACCESS_ALLOWED_ACE, ACE_HEADER, ACL, ACL_SIZE_INFORMATION, AclSizeInformation, DACL_SECURITY_INFORMATION, EqualSid,
    GetAce, GetAclInformation, INHERITED_ACE, PSECURITY_DESCRIPTOR,
};

use super::{ACCESS_ALLOWED, ACCESS_DENIED, Sid, wide_path, win32};

/// A path's DACL and the security descriptor that owns it, freed on drop.
pub(super) struct Dacl {
    pub(super) acl: *mut ACL,
    pub(super) sd: PSECURITY_DESCRIPTOR,
}

impl Dacl {
    pub(super) fn read(path: &Path) -> io::Result<Dacl> {
        let name = wide_path(path);
        let (mut acl, mut sd) = (std::ptr::null_mut(), std::ptr::null_mut());
        // SAFETY: a NUL-terminated path and out pointers for the DACL and its descriptor (freed in Drop).
        let error = unsafe {
            GetNamedSecurityInfoW(
                name.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut acl,
                std::ptr::null_mut(),
                &mut sd,
            )
        };
        win32(error)?;
        Ok(Dacl { acl, sd })
    }

    /// The explicit ACEs naming `sid`, as (denies, mask, flags).
    pub(super) fn entries(&self, sid: &Sid) -> io::Result<Vec<(bool, u32, u32)>> {
        if self.acl.is_null() {
            return Ok(Vec::new());
        }
        let mut size = ACL_SIZE_INFORMATION::default();
        // SAFETY: a valid ACL and the structure this information class expects, with its exact size.
        let ok = unsafe {
            GetAclInformation(
                self.acl,
                (&raw mut size).cast(),
                size_of::<ACL_SIZE_INFORMATION>() as u32,
                AclSizeInformation,
            )
        };
        if ok == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut found = Vec::new();
        for index in 0..size.AceCount {
            let mut ace = std::ptr::null_mut();
            // SAFETY: an index below AceCount of a valid ACL.
            if unsafe { GetAce(self.acl, index, &mut ace) } == 0 {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: every ACE starts with an ACE_HEADER.
            let header = unsafe { *ace.cast::<ACE_HEADER>() };
            if !matches!(header.AceType, ACCESS_ALLOWED | ACCESS_DENIED)
                || u32::from(header.AceFlags) & INHERITED_ACE != 0
            {
                continue;
            }
            // Allowed and denied ACEs share this layout: header, mask, then the SID in place.
            let ace = ace.cast::<ACCESS_ALLOWED_ACE>();
            // SAFETY: an allowed/denied ACE, whose SID starts at SidStart.
            let (mask, named) = unsafe { ((*ace).Mask, EqualSid((&raw mut (*ace).SidStart).cast(), sid.raw()) != 0) };
            if named {
                found.push((header.AceType == ACCESS_DENIED, mask, u32::from(header.AceFlags)));
            }
        }
        Ok(found)
    }

    pub(super) fn has(&self, sid: &Sid, mask: u32, flags: u32) -> io::Result<bool> {
        Ok(self
            .entries(sid)?
            .iter()
            .any(|&(denies, m, f)| !denies && m & mask == mask && f & flags == flags))
    }

    pub(super) fn mentions(&self, sid: &Sid) -> io::Result<bool> {
        Ok(!self.entries(sid)?.is_empty())
    }

    pub(super) fn write(&self, path: &Path, sid: &Sid, mode: i32, mask: u32, flags: u32) -> io::Result<()> {
        let entry = EXPLICIT_ACCESS_W {
            grfAccessPermissions: mask,
            grfAccessMode: mode,
            grfInheritance: flags,
            Trustee: TRUSTEE_W {
                pMultipleTrustee: std::ptr::null_mut(),
                MultipleTrusteeOperation: NO_MULTIPLE_TRUSTEE,
                TrusteeForm: TRUSTEE_IS_SID,
                TrusteeType: TRUSTEE_IS_UNKNOWN,
                ptstrName: sid.raw().cast(),
            },
        };
        let mut next: *mut ACL = std::ptr::null_mut();
        // SAFETY: one initialized entry naming a live SID; the old ACL may be null; `next` is freed below.
        win32(unsafe { SetEntriesInAclW(1, &entry, self.acl, &mut next) })?;
        let name = wide_path(path);
        // Not SetFileSecurityW: SetNamedSecurityInfoW also updates the inherited ACEs of the existing subtree.
        // SAFETY: a NUL-terminated path and the ACL built above.
        let error = unsafe {
            SetNamedSecurityInfoW(
                name.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                next,
                std::ptr::null(),
            )
        };
        // SAFETY: allocated by SetEntriesInAclW.
        unsafe { LocalFree(next.cast()) };
        win32(error)
    }
}

impl Drop for Dacl {
    fn drop(&mut self) {
        // SAFETY: allocated by GetNamedSecurityInfoW; the ACL points into it.
        unsafe { LocalFree(self.sd) };
    }
}
