//! Windows-only, pinned, handle-relative quarantine rename.

use std::ffi::c_void;
use std::os::windows::ffi::OsStrExt;
use std::ptr::{null, null_mut};

use napi::bindgen_prelude::AsyncTask;
use napi::{Env, Task};
use napi_derive::napi;

type Handle = *mut c_void;

#[repr(C)]
struct UnicodeString { length: u16, maximum_length: u16, buffer: *const u16 }
#[repr(C)]
struct ObjectAttributes { length: u32, root: Handle, name: *const UnicodeString, attributes: u32, security: *mut c_void, qos: *mut c_void }
#[repr(C)]
struct IoStatus { status: usize, information: usize }

#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtCreateFile(handle: *mut Handle, access: u32, attributes: *const ObjectAttributes, status: *mut IoStatus, size: *const i64, file_attributes: u32, share: u32, disposition: u32, options: u32, ea: *const c_void, ea_len: u32) -> i32;
    fn NtQueryInformationFile(handle: Handle, status: *mut IoStatus, output: *mut c_void, length: u32, class: u32) -> i32;
    fn NtSetInformationFile(handle: Handle, status: *mut IoStatus, input: *const c_void, length: u32, class: u32) -> i32;
    fn NtClose(handle: Handle) -> i32;
}
#[link(name = "kernel32")]
unsafe extern "system" { fn QueryDosDeviceW(name: *const u16, target: *mut u16, length: u32) -> u32; }

struct Owned(Handle);
impl Drop for Owned {
    fn drop(&mut self) {
        // SAFETY: this object owns exactly one successful NtCreateFile handle.
        unsafe { NtClose(self.0); }
    }
}

fn status(code: i32) -> Result<(), String> {
    if code >= 0 { Ok(()) } else { Err(format!("NTSTATUS 0x{:08x}", code as u32)) }
}

fn query(handle: Handle, class: u32, out: &mut [u8]) -> Result<(), String> {
    let mut io = IoStatus { status: 0, information: 0 };
    // SAFETY: the output and status buffers are valid and remain live through the synchronous call.
    status(unsafe { NtQueryInformationFile(handle, &mut io, out.as_mut_ptr().cast(), out.len() as u32, class) })
}

fn identity(handle: Handle) -> Result<String, String> {
    let mut bytes = [0u8; 24];
    query(handle, 59, &mut bytes)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn open(parent: Handle, name: &str, directory: bool, removable: bool) -> Result<Owned, String> {
    open_optional(parent, name, directory, removable, false)?.ok_or_else(|| "missing component".into())
}

fn open_optional(parent: Handle, name: &str, directory: bool, removable: bool, missing_ok: bool) -> Result<Option<Owned>, String> {
    let text: Vec<u16> = std::ffi::OsStr::new(name).encode_wide().collect();
    if text.is_empty() || text.len() > 32767 || text.contains(&0) { return Err("invalid component".into()); }
    let name = UnicodeString { length: (text.len() * 2) as u16, maximum_length: (text.len() * 2) as u16, buffer: text.as_ptr() };
    let attributes = ObjectAttributes { length: std::mem::size_of::<ObjectAttributes>() as u32, root: parent, name: &name, attributes: 0x40 | if parent.is_null() { 0 } else { 0x1000 }, security: null_mut(), qos: null_mut() };
    let mut result = null_mut();
    let mut io = IoStatus { status: 0, information: 0 };
    // No FILE_SHARE_DELETE: acquired ancestry and source cannot be renamed or removed by a competing opener.
    // SAFETY: all structures and buffers are correctly laid out and live for this synchronous NT call.
    let code = unsafe { NtCreateFile(&mut result, 0x100000 | 0x80 | if directory { 0x21 } else { 0 } | if removable { 0x10000 } else { 0 }, &attributes, &mut io, null(), 0, 3, 1, 0x20 | 0x200000 | if directory { 1 } else { 0 }, null(), 0) };
    if missing_ok && code as u32 == 0xc0000034 { return Ok(None); }
    status(code)?;
    let result = Owned(result);
    let mut info = [0u8; 8];
    query(result.0, 35, &mut info)?;
    let flags = u32::from_le_bytes([info[0], info[1], info[2], info[3]]);
    if flags & 0x400 != 0 || (directory && flags & 0x10 == 0) { return Err("reparse point or non-directory".into()); }
    Ok(Some(result))
}

fn parse(path: &str) -> Result<(String, Vec<String>), String> {
    let value = path.replace('/', "\\");
    let bytes = value.as_bytes();
    if bytes.len() < 4 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' || bytes[2] != b'\\' { return Err("absolute local drive path required".into()); }
    let parts: Vec<String> = value[3..].split('\\').map(str::to_owned).collect();
    if parts.iter().any(|p| p.is_empty() || p == "." || p == ".." || p.contains(':') || p.ends_with('.') || p.ends_with(' ') || p.contains('\0')) { return Err("invalid path component".into()); }
    Ok((value[..2].to_ascii_uppercase(), parts))
}

fn root(drive: &str) -> Result<Owned, String> {
    let name: Vec<u16> = std::ffi::OsStr::new(drive).encode_wide().chain(Some(0)).collect();
    let mut target = vec![0u16; 32768];
    // SAFETY: both buffers are valid, and the target length is in UTF-16 code units.
    let count = unsafe { QueryDosDeviceW(name.as_ptr(), target.as_mut_ptr(), target.len() as u32) } as usize;
    if count == 0 || count >= target.len() { return Err("drive mapping unavailable".into()); }
    let end = target.iter().position(|x| *x == 0).ok_or("invalid drive mapping")?;
    let mapping = String::from_utf16(&target[..end]).map_err(|_| "invalid drive mapping")?;
    let pieces: Vec<&str> = mapping.split('\\').collect();
    if pieces.len() != 3 || pieces[0] != "" || pieces[1] != "Device" || !pieces[2].starts_with("HarddiskVolume") || !pieces[2][14..].bytes().all(|c| c.is_ascii_digit()) || pieces[2].len() == 14 { return Err("unsupported drive mapping".into()); }
    open(null_mut(), &format!("{mapping}\\"), true, false)
}

fn parents(root: &Owned, parts: &[String]) -> Result<Vec<Owned>, String> {
    let mut handles = Vec::new();
    for part in parts {
        let parent = handles.last().map_or(root.0, |h: &Owned| h.0);
        handles.push(open(parent, part, true, false)?);
    }
    Ok(handles)
}

fn operate(source: &str, destination: Option<&str>, expected: Option<&str>) -> Result<String, String> {
    let (drive, source_parts) = parse(source)?;
    let (dest_drive, dest_parts) = match destination { Some(path) => { let (d, p) = parse(path)?; (Some(d), p) }, None => (None, Vec::new()) };
    if dest_drive.as_ref().is_some_and(|other| other != &drive) { return Err("different drive".into()); }
    let root = root(&drive)?;
    let source_parents = parents(&root, &source_parts[..source_parts.len()-1])?;
    let source_parent = source_parents.last().map_or(root.0, |h| h.0);
    let source_handle = open(source_parent, &source_parts[source_parts.len()-1], false, destination.is_some())?;
    let current = identity(source_handle.0)?;
    if destination.is_none() { return Ok(current); }
    if expected != Some(current.as_str()) { return Err("source identity changed".into()); }
    let destination_parents = parents(&root, &dest_parts[..dest_parts.len()-1])?;
    let destination_parent = destination_parents.last().map_or(root.0, |h| h.0);
    let name: Vec<u16> = std::ffi::OsStr::new(&dest_parts[dest_parts.len()-1]).encode_wide().collect();
    let length = 20 + name.len() * 2;
    let mut storage = vec![0u64; (length + 7) / 8];
    // SAFETY: storage is aligned and allocated for the documented FILE_RENAME_INFORMATION layout.
    let bytes = unsafe { std::slice::from_raw_parts_mut(storage.as_mut_ptr().cast::<u8>(), storage.len() * 8) };
    bytes[8..16].copy_from_slice(&(destination_parent as usize as u64).to_le_bytes());
    bytes[16..20].copy_from_slice(&((name.len() * 2) as u32).to_le_bytes());
    for (index, code) in name.iter().enumerate() { bytes[20 + index * 2..22 + index * 2].copy_from_slice(&code.to_le_bytes()); }
    let mut io = IoStatus { status: 0, information: 0 };
    // ReplaceIfExists is zero. The pinned source and destination parent are kernel handles.
    // SAFETY: the aligned information buffer and handles remain live throughout the synchronous call.
    status(unsafe { NtSetInformationFile(source_handle.0, &mut io, storage.as_ptr().cast(), length as u32, 10) })?;
    Ok(current)
}

pub struct QuarantineTask { source: String, destination: Option<String>, expected: Option<String> }
impl Task for QuarantineTask {
    type Output = String;
    type JsValue = String;
    fn compute(&mut self) -> napi::Result<String> { operate(&self.source, self.destination.as_deref(), self.expected.as_deref()).map_err(napi::Error::from_reason) }
    fn resolve(&mut self, _: Env, value: String) -> napi::Result<String> { Ok(value) }
}

#[napi]
pub fn quarantine_identity(source: String) -> AsyncTask<QuarantineTask> {
    AsyncTask::new(QuarantineTask { source, destination: None, expected: None })
}
#[napi]
pub fn quarantine_rename(source: String, destination: String, expected: String) -> AsyncTask<QuarantineTask> {
    AsyncTask::new(QuarantineTask { source, destination: Some(destination), expected: Some(expected) })
}

/// Inspects only after every parent has been acquired without traversing a reparse point.
pub struct QuarantineInspectTask { source: String }
impl Task for QuarantineInspectTask {
    type Output = Option<String>;
    type JsValue = Option<String>;
    fn compute(&mut self) -> napi::Result<Option<String>> {
        let inspect = || -> Result<Option<String>, String> {
            let (drive, parts) = parse(&self.source)?;
            let root = root(&drive)?;
            let ancestors = parents(&root, &parts[..parts.len()-1])?;
            let parent = ancestors.last().map_or(root.0, |h| h.0);
            let Some(source) = open_optional(parent, &parts[parts.len()-1], false, false, true)? else { return Ok(None); };
            identity(source.0).map(Some)
        };
        inspect().map_err(napi::Error::from_reason)
    }
    fn resolve(&mut self, _: Env, value: Option<String>) -> napi::Result<Option<String>> { Ok(value) }
}

#[napi]
pub fn quarantine_inspect(source: String) -> AsyncTask<QuarantineInspectTask> {
    AsyncTask::new(QuarantineInspectTask { source })
}
