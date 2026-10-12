//! The AppContainer profile and its file grants. A grant is one explicit allow ACE for the profile's SID on one path,
//! inherited by the subtree. There are no deny grants: a deny ACE for the profile's SID below an inherited allow did
//! not stop a write on windows-latest, so the host keeps denied paths out of every granted tree instead. Applying a
//! grant that the path already carries writes nothing, so a reused profile never re-walks its trees; revoking removes
//! every explicit ACE for the SID and the inherited copies with them.

use std::io;
use std::os::windows::io::{AsRawHandle, HandleOrInvalid, OwnedHandle, RawHandle};
use std::path::Path;

use windows_sys::Win32::Foundation::{ERROR_ALREADY_EXISTS, ERROR_SUCCESS, GENERIC_READ, HANDLE, LocalFree};
use windows_sys::Win32::Security::Authorization::{
    ConvertSecurityDescriptorToStringSecurityDescriptorW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
    EXPLICIT_ACCESS_W, GRANT_ACCESS, GetSecurityInfo, NO_MULTIPLE_TRUSTEE, REVOKE_ACCESS, SDDL_REVISION_1,
    SE_FILE_OBJECT, SetEntriesInAclW, SetSecurityInfo, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
use windows_sys::Win32::Security::Isolation::{
    CreateAppContainerProfile, DeleteAppContainerProfile, DeriveAppContainerSidFromAppContainerName,
};
use windows_sys::Win32::Security::{
    ACL, CONTAINER_INHERIT_ACE, DACL_SECURITY_INFORMATION, GetSecurityDescriptorControl, GetSecurityDescriptorDacl,
    OBJECT_INHERIT_ACE, PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, PSID, SE_DACL_PROTECTED,
    UNPROTECTED_DACL_SECURITY_INFORMATION,
};
use windows_sys::Win32::Storage::FileSystem::{
    BY_HANDLE_FILE_INFORMATION, CreateFileW, DELETE, FILE_ATTRIBUTE_DIRECTORY, FILE_FLAG_BACKUP_SEMANTICS,
    FILE_FLAG_OPEN_REPARSE_POINT, FILE_GENERIC_EXECUTE, FILE_GENERIC_READ, FILE_GENERIC_WRITE, FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ, FILE_SHARE_WRITE, GetFileInformationByHandle, OPEN_EXISTING, READ_CONTROL, WRITE_DAC,
};

use super::{wide, wide_path};

mod dacl;
mod sid;
use dacl::Dacl;
pub(super) use sid::{Sid, capability};

/// What a confined path is identified by across its many possible names (symlink, hardlink, `.`): the volume and the
/// file index. Used to dedupe guards that resolve to the same object so restore is order-independent.
pub(super) type Identity = (u32, u64);

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
        return checked(hr).map(|()| Sid(sid, false));
    }
    checked(hr).map(|()| Sid(sid, false))
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

/// Opens `path` itself — never a reparse point's target (`FILE_FLAG_OPEN_REPARSE_POINT`) and a directory as well as a
/// file (`FILE_FLAG_BACKUP_SEMANTICS`) — for reading, or editing, its DACL. All guard ACL work goes through a handle so
/// it lands on the link, not on whatever it points at.
fn open(path: &Path, write: bool) -> io::Result<OwnedHandle> {
    let name = wide_path(path);
    let access = READ_CONTROL | FILE_READ_ATTRIBUTES | if write { WRITE_DAC } else { 0 };
    // SAFETY: a NUL-terminated path, no security attributes; the raw handle is adopted as owned or the error is read.
    let raw = unsafe {
        CreateFileW(
            name.as_ptr(),
            access,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        )
    };
    // SAFETY: `raw` is INVALID_HANDLE_VALUE on failure or a fresh handle owned by nobody else.
    OwnedHandle::try_from(unsafe { HandleOrInvalid::from_raw_handle(raw as RawHandle) })
        .map_err(|_| io::Error::last_os_error())
}

/// Holds a directory open with no delete share so no one can rename or delete it while the handle lives. Pinning every
/// directory from a guarded path up to its write root stops the container from moving a parent aside and recreating
/// the path (the ACL would follow the old inode). Opens the link itself, so a junction swapped in cannot be unpinned.
pub(super) fn pin(path: &Path) -> io::Result<OwnedHandle> {
    let name = wide_path(path);
    // SAFETY: a NUL-terminated path, no security attributes; the raw handle is adopted as owned or the error is read.
    let raw = unsafe {
        CreateFileW(
            name.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            std::ptr::null_mut(),
        )
    };
    // SAFETY: `raw` is INVALID_HANDLE_VALUE on failure or a fresh handle owned by nobody else.
    OwnedHandle::try_from(unsafe { HandleOrInvalid::from_raw_handle(raw as RawHandle) })
        .map_err(|_| io::Error::last_os_error())
}

/// The volume and file index of the link at `path`, identifying the object across its names.
pub(super) fn identity(path: &Path) -> io::Result<Identity> {
    let handle = open(path, false)?;
    file_info(&handle).map(|info| {
        (
            info.dwVolumeSerialNumber,
            (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow),
        )
    })
}

fn file_info(handle: &OwnedHandle) -> io::Result<BY_HANDLE_FILE_INFORMATION> {
    // SAFETY: BY_HANDLE_FILE_INFORMATION is plain data; GetFileInformationByHandle fills it before any field is read.
    let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    // SAFETY: a live handle and an out structure.
    if unsafe { GetFileInformationByHandle(handle.as_raw_handle() as HANDLE, &mut info) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(info)
}

/// Makes the profile read-only on the link at `path`: a deny ACE below an inherited allow does not hold, so instead
/// the DACL is detached from inheritance (its effective ACEs copied in place, so every other trustee keeps what it
/// had), every explicit ACE for `sid` is removed, and one read-and-execute ACE is granted. Idempotent and run for
/// every joining profile, so a second container with a write grant that was copied in by the first command's detach is
/// also stripped to read-only. A directory grants it inheritable, and the parent write grant never carries
/// `FILE_DELETE_CHILD`, so the container can neither write into, delete nor rename the path.
pub(super) fn protect(path: &Path, sid: &Sid) -> io::Result<()> {
    let handle = open(path, true)?;
    let flags = if file_info(&handle)?.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY != 0 {
        OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE
    } else {
        0
    };
    // Copy the inherited ACEs in place and disable further inheritance, so the parents' write grants stop flowing in.
    let detached = HandleDacl::read(&handle)?;
    detached.set(
        &handle,
        DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
        detached.acl,
    )?;
    // Drop every right any profile had here (the copies of the parents' write grants among them), then read-only.
    let current = HandleDacl::read(&handle)?;
    let entries = [
        explicit(sid, REVOKE_ACCESS, 0, 0),
        explicit(sid, GRANT_ACCESS, Grant::Read.mask(), flags),
    ];
    current.edit(&handle, &entries)
}

/// The link's DACL and its inheritance state as an SDDL string, to restore verbatim after the command.
pub(super) fn capture(path: &Path) -> io::Result<String> {
    let dacl = HandleDacl::read(&open(path, false)?)?;
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

/// Restores a DACL captured by [`capture`] on the link at `path`, including whether it was protected from inheritance.
/// Setting an unprotected DACL drops the inherited ACEs the string carries and lets the parents' ACEs flow back in.
pub(super) fn restore(path: &Path, sddl: &str) -> io::Result<()> {
    let handle = open(path, true)?;
    let text: Vec<u16> = sddl.encode_utf16().chain([0]).collect();
    let mut sd: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    // SAFETY: a NUL-terminated SDDL string and an out pointer for the descriptor (freed below).
    if unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            text.as_ptr(),
            SDDL_REVISION_1,
            &mut sd,
            std::ptr::null_mut(),
        )
    } == 0
    {
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
            | if control & SE_DACL_PROTECTED != 0 {
                PROTECTED_DACL_SECURITY_INFORMATION
            } else {
                UNPROTECTED_DACL_SECURITY_INFORMATION
            };
        // SAFETY: a live handle and a DACL that lives in `sd`.
        win32(unsafe {
            SetSecurityInfo(
                handle.as_raw_handle() as HANDLE,
                SE_FILE_OBJECT,
                info,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                dacl,
                std::ptr::null(),
            )
        })
    })();
    // SAFETY: allocated by ConvertStringSecurityDescriptorToSecurityDescriptorW.
    unsafe { LocalFree(sd.cast()) };
    restore
}

/// One EXPLICIT_ACCESS entry naming `sid`.
fn explicit(sid: &Sid, mode: i32, mask: u32, flags: u32) -> EXPLICIT_ACCESS_W {
    EXPLICIT_ACCESS_W {
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
    }
}

/// A handle's DACL and the descriptor that owns it, freed on drop. Mirrors [`Dacl`] but by handle, so it acts on the
/// link rather than a reparse target.
struct HandleDacl {
    acl: *mut ACL,
    sd: PSECURITY_DESCRIPTOR,
}

impl HandleDacl {
    fn read(handle: &OwnedHandle) -> io::Result<HandleDacl> {
        let (mut acl, mut sd) = (std::ptr::null_mut(), std::ptr::null_mut());
        // SAFETY: a live handle and out pointers for the DACL and its descriptor (freed in Drop).
        let error = unsafe {
            GetSecurityInfo(
                handle.as_raw_handle() as HANDLE,
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
        Ok(HandleDacl { acl, sd })
    }

    fn set(&self, handle: &OwnedHandle, info: u32, acl: *mut ACL) -> io::Result<()> {
        // SAFETY: a live handle and a DACL this object owns for the call's duration.
        win32(unsafe {
            SetSecurityInfo(
                handle.as_raw_handle() as HANDLE,
                SE_FILE_OBJECT,
                info,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                acl,
                std::ptr::null(),
            )
        })
    }

    /// Merges `entries` into the DACL and writes it back under `DACL_SECURITY_INFORMATION`, which preserves the
    /// object's protected (detached) state.
    fn edit(&self, handle: &OwnedHandle, entries: &[EXPLICIT_ACCESS_W]) -> io::Result<()> {
        let mut next: *mut ACL = std::ptr::null_mut();
        // SAFETY: initialized entries naming a live SID; the old ACL may be null; `next` is freed below.
        win32(unsafe { SetEntriesInAclW(entries.len() as u32, entries.as_ptr(), self.acl, &mut next) })?;
        let result = self.set(handle, DACL_SECURITY_INFORMATION, next);
        // SAFETY: allocated by SetEntriesInAclW.
        unsafe { LocalFree(next.cast()) };
        result
    }
}

impl Drop for HandleDacl {
    fn drop(&mut self) {
        // SAFETY: allocated by GetSecurityInfo; the ACL points into it.
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
