//! The AppContainer profile and its file grants. A grant is one explicit allow ACE for the profile's SID on one path,
//! inherited by the subtree. There are no deny grants: a deny ACE for the profile's SID below an inherited allow did
//! not stop a write on windows-latest, so the host keeps denied paths out of every granted tree instead. Applying a
//! grant that the path already carries writes nothing, so a reused profile never re-walks its trees; revoking removes
//! every explicit ACE for the SID and the inherited copies with them.

use std::io;
use std::path::Path;

use windows_sys::Win32::Foundation::{ERROR_ALREADY_EXISTS, ERROR_SUCCESS, LocalFree};
use windows_sys::Win32::Security::Authorization::{
    ConvertSecurityDescriptorToStringSecurityDescriptorW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
    EXPLICIT_ACCESS_W, GRANT_ACCESS, GetNamedSecurityInfoW, NO_MULTIPLE_TRUSTEE, REVOKE_ACCESS, SDDL_REVISION_1,
    SE_FILE_OBJECT, SetEntriesInAclW, SetNamedSecurityInfoW, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
use windows_sys::Win32::Security::Isolation::{
    CreateAppContainerProfile, DeleteAppContainerProfile, DeriveAppContainerSidFromAppContainerName,
};
use windows_sys::Win32::Security::{
    ACCESS_ALLOWED_ACE, ACE_HEADER, ACL, ACL_SIZE_INFORMATION, AclSizeInformation, CONTAINER_INHERIT_ACE,
    DACL_SECURITY_INFORMATION, EqualSid, FreeSid, GetAce, GetAclInformation, GetSecurityDescriptorControl,
    GetSecurityDescriptorDacl, INHERITED_ACE, OBJECT_INHERIT_ACE, PROTECTED_DACL_SECURITY_INFORMATION,
    PSECURITY_DESCRIPTOR, PSID, SE_DACL_PROTECTED, UNPROTECTED_DACL_SECURITY_INFORMATION,
};
use windows_sys::Win32::Storage::FileSystem::{DELETE, FILE_GENERIC_EXECUTE, FILE_GENERIC_READ, FILE_GENERIC_WRITE};

use super::{wide, wide_path};

const ACCESS_ALLOWED: u8 = 0;
const ACCESS_DENIED: u8 = 1;

/// What one grant gives the profile on one path.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Grant {
    /// Read and execute, inherited by the subtree.
    Read,
    /// Read, write, execute and delete, inherited. Never `FILE_DELETE_CHILD`.
    Write,
}

impl Grant {
    fn mask(self) -> u32 {
        match self {
            Grant::Read => FILE_GENERIC_READ | FILE_GENERIC_EXECUTE,
            Grant::Write => FILE_GENERIC_READ | FILE_GENERIC_WRITE | FILE_GENERIC_EXECUTE | DELETE,
        }
    }
}

/// The profile's SID, freed on drop.
pub(super) struct Sid(PSID);

impl Sid {
    pub(super) fn raw(&self) -> PSID {
        self.0
    }
}

impl Drop for Sid {
    fn drop(&mut self) {
        // SAFETY: a SID from CreateAppContainerProfile or DeriveAppContainerSidFromAppContainerName.
        unsafe { FreeSid(self.0) };
    }
}

/// Creates the named profile, or reuses it when it exists.
pub(super) fn profile(name: &str) -> io::Result<Sid> {
    let name = wide(name);
    let mut sid: PSID = std::ptr::null_mut();
    // SAFETY: NUL-terminated strings, no capabilities, and an out pointer for the SID.
    let hr = unsafe {
        CreateAppContainerProfile(
            name.as_ptr(),
            name.as_ptr(),
            name.as_ptr(),
            std::ptr::null(),
            0,
            &mut sid,
        )
    };
    if hr == hresult(ERROR_ALREADY_EXISTS) {
        // SAFETY: a NUL-terminated name and an out pointer for the SID.
        let hr = unsafe { DeriveAppContainerSidFromAppContainerName(name.as_ptr(), &mut sid) };
        return checked(hr).map(|()| Sid(sid));
    }
    checked(hr).map(|()| Sid(sid))
}

/// Deletes the named profile; a missing one is already gone.
pub(super) fn delete(name: &str) -> io::Result<()> {
    let name = wide(name);
    // SAFETY: a NUL-terminated name.
    let hr = unsafe { DeleteAppContainerProfile(name.as_ptr()) };
    checked(hr)
}

/// Adds the grant unless `path` already carries it as an explicit ACE.
pub(super) fn apply(path: &Path, sid: &Sid, grant: Grant) -> io::Result<()> {
    // A directory's grant covers its subtree; a file takes no inheritance flags.
    let flags = if std::fs::metadata(path)?.is_dir() {
        OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE
    } else {
        0
    };
    let current = Dacl::read(path)?;
    if current.has(sid, grant.mask(), flags)? {
        return Ok(());
    }
    current.write(path, sid, GRANT_ACCESS, grant.mask(), flags)
}

/// Removes every explicit ACE for the SID from `path` (and, with them, their inherited copies below it).
pub(super) fn revoke(path: &Path, sid: &Sid) -> io::Result<()> {
    let current = Dacl::read(path)?;
    if !current.mentions(sid)? {
        return Ok(());
    }
    current.write(path, sid, REVOKE_ACCESS, 0, 0)
}

/// Makes the profile read-only on `path`: a deny ACE below an inherited allow does not hold, so instead the path's
/// DACL is detached from inheritance (its effective ACEs copied in place, so every other trustee keeps what it had),
/// every explicit ACE for the SID is removed, and one explicit read-and-execute ACE is granted. A directory grants it
/// inheritable so its children are read-only too, and, because the parent write grant never carries
/// `FILE_DELETE_CHILD`, the container can neither write into, delete, nor rename the path.
pub(super) fn protect(path: &Path, sid: &Sid) -> io::Result<()> {
    let flags = if std::fs::metadata(path)?.is_dir() {
        OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE
    } else {
        0
    };
    // Copy the inherited ACEs in place and disable further inheritance, so the parent's write grant stops flowing in.
    let current = Dacl::read(path)?;
    current.set(path, DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION, current.acl)?;
    // Drop every right the container had here (the copies of the parent's write grant among them), then read-only.
    revoke(path, sid)?;
    Dacl::read(path)?.write(path, sid, GRANT_ACCESS, Grant::Read.mask(), flags)
}

/// The path's DACL and its inheritance state as an SDDL string, to restore verbatim after the command.
pub(super) fn capture(path: &Path) -> io::Result<String> {
    let dacl = Dacl::read(path)?;
    let (mut text, mut len): (*mut u16, u32) = (std::ptr::null_mut(), 0);
    // SAFETY: a valid security descriptor and out pointers for the allocated string and its length.
    let ok = unsafe {
        ConvertSecurityDescriptorToStringSecurityDescriptorW(
            dacl.sd,
            SDDL_REVISION_1,
            DACL_SECURITY_INFORMATION,
            &mut text,
            &mut len,
        )
    };
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: `text` points at `len` UTF-16 units allocated by the call; freed right after copying.
    let copy = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(text, len as usize) });
    // SAFETY: allocated by ConvertSecurityDescriptorToStringSecurityDescriptorW.
    unsafe { LocalFree(text.cast()) };
    Ok(copy)
}

/// Restores a DACL captured by [`capture`], including whether it was protected from inheritance. Setting an
/// unprotected DACL drops the inherited ACEs the string carries and lets the parent's ACEs flow back in.
pub(super) fn restore(path: &Path, sddl: &str) -> io::Result<()> {
    let text: Vec<u16> = sddl.encode_utf16().chain([0]).collect();
    let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    // SAFETY: a NUL-terminated SDDL string and an out pointer for the descriptor (freed below).
    if unsafe { ConvertStringSecurityDescriptorToSecurityDescriptorW(text.as_ptr(), SDDL_REVISION_1, &mut sd, std::ptr::null_mut()) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let restore = (|| {
        let (mut control, mut revision): (u16, u32) = (0, 0);
        // SAFETY: a valid descriptor and out values.
        if unsafe { GetSecurityDescriptorControl(sd, &mut control, &mut revision) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let (mut present, mut dacl, mut defaulted): (i32, *mut ACL, i32) = (0, std::ptr::null_mut(), 0);
        // SAFETY: a valid descriptor and out values; `dacl` points into `sd`.
        if unsafe { GetSecurityDescriptorDacl(sd, &mut present, &mut dacl, &mut defaulted) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let info = DACL_SECURITY_INFORMATION
            | if control & SE_DACL_PROTECTED != 0 { PROTECTED_DACL_SECURITY_INFORMATION } else { UNPROTECTED_DACL_SECURITY_INFORMATION };
        let name = wide_path(path);
        // SAFETY: a NUL-terminated path and a DACL that lives in `sd`.
        win32(unsafe { SetNamedSecurityInfoW(name.as_ptr(), SE_FILE_OBJECT, info, std::ptr::null_mut(), std::ptr::null_mut(), dacl, std::ptr::null()) })
    })();
    // SAFETY: allocated by ConvertStringSecurityDescriptorToSecurityDescriptorW.
    unsafe { LocalFree(sd.cast()) };
    restore
}

/// A path's DACL and the security descriptor that owns it, freed on drop.
struct Dacl {
    acl: *mut ACL,
    sd: PSECURITY_DESCRIPTOR,
}

impl Dacl {
    fn read(path: &Path) -> io::Result<Dacl> {
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
    fn entries(&self, sid: &Sid) -> io::Result<Vec<(bool, u32, u32)>> {
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

    fn has(&self, sid: &Sid, mask: u32, flags: u32) -> io::Result<bool> {
        Ok(self
            .entries(sid)?
            .iter()
            .any(|&(denies, m, f)| !denies && m & mask == mask && f & flags == flags))
    }

    fn mentions(&self, sid: &Sid) -> io::Result<bool> {
        Ok(!self.entries(sid)?.is_empty())
    }

    /// Writes `acl` to `path` under `info` (used to detach a DACL from inheritance by passing its own ACEs back with
    /// `PROTECTED_DACL_SECURITY_INFORMATION`, which copies the inherited ones in place).
    fn set(&self, path: &Path, info: u32, acl: *mut ACL) -> io::Result<()> {
        let name = wide_path(path);
        // SAFETY: a NUL-terminated path and a DACL this object owns for the call's duration.
        win32(unsafe {
            SetNamedSecurityInfoW(name.as_ptr(), SE_FILE_OBJECT, info, std::ptr::null_mut(), std::ptr::null_mut(), acl, std::ptr::null())
        })
    }

    fn write(&self, path: &Path, sid: &Sid, mode: i32, mask: u32, flags: u32) -> io::Result<()> {
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

fn hresult(error: u32) -> i32 {
    ((error & 0xFFFF) | 0x8007_0000) as i32
}

fn checked(hr: i32) -> io::Result<()> {
    if hr >= 0 {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(hr))
    }
}

fn win32(error: u32) -> io::Result<()> {
    if error == ERROR_SUCCESS {
        Ok(())
    } else {
        Err(io::Error::from_raw_os_error(error as i32))
    }
}
