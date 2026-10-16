// Producer-only N-API bridge. No crates, alternate filesystem implementation,
// shell, or helper process holds filesystem handles. Windows x64 and ARM64 use
// the same 64-bit SDK layouts built by artifact-windows.ts.
#![cfg(all(windows, target_pointer_width = "64"))]

use std::{ffi::c_void, ptr, sync::OnceLock};
type Handle = *mut c_void;
type Env = *mut c_void;
type Value = *mut c_void;
type Info = *mut c_void;
type Callback = unsafe extern "C" fn(Env, Info) -> Value;

#[link(name = "kernel32")]
extern "system" {
    fn GetModuleHandleW(name: *const u16) -> Handle;
    fn GetProcAddress(module: Handle, name: *const u8) -> *mut c_void;
    fn GetCurrentProcess() -> Handle;
    fn IsWow64Process2(process: Handle, process_machine: *mut u16, native_machine: *mut u16) -> i32;
    fn QueryDosDeviceW(name: *const u16, target: *mut u16, length: u32) -> u32;
    fn GetFinalPathNameByHandleW(handle: Handle, path: *mut u16, length: u32, flags: u32) -> u32;
    fn CompareStringOrdinal(left: *const u16, left_len: i32, right: *const u16, right_len: i32, ignore_case: i32) -> i32;
}
#[link(name = "ntdll")]
extern "system" {
    fn NtCreateFile(handle: *mut Handle, access: u32, attributes: *const c_void, status: *mut c_void,
        allocation: *const i64, flags: u32, share: u32, disposition: u32, options: u32, ea: *const c_void, ea_len: u32) -> i32;
    fn NtQueryInformationFile(handle: Handle, status: *mut c_void, information: *mut c_void, length: u32, kind: u32) -> i32;
    fn NtReadFile(handle: Handle, event: Handle, apc: *const c_void, context: *const c_void, status: *mut c_void,
        buffer: *mut c_void, length: u32, offset: *const i64, key: *const u32) -> i32;
    fn NtWriteFile(handle: Handle, event: Handle, apc: *const c_void, context: *const c_void, status: *mut c_void,
        buffer: *const c_void, length: u32, offset: *const i64, key: *const u32) -> i32;
    fn NtQueryDirectoryFile(handle: Handle, event: Handle, apc: *const c_void, context: *const c_void, status: *mut c_void,
        buffer: *mut c_void, length: u32, kind: u32, single: u8, name: *const c_void, restart: u8) -> i32;
    fn NtSetInformationFile(handle: Handle, status: *mut c_void, information: *const c_void, length: u32, kind: u32) -> i32;
    fn NtClose(handle: Handle) -> i32;
}

macro_rules! api {
    ($($name:ident: $kind:ty),+ $(,)?) => {
        struct Api { $($name: $kind),+ }
        impl Api {
            unsafe fn load() -> Option<Self> {
                let module = GetModuleHandleW(ptr::null());
                Some(Self { $($name: {
                    let address = GetProcAddress(module, concat!(stringify!($name), "\0").as_ptr());
                    if address.is_null() { return None; }
                    std::mem::transmute::<*mut c_void, $kind>(address)
                }),+ })
            }
        }
    }
}
mod napi {
    use super::{Callback, Env, GetModuleHandleW, GetProcAddress, Info, Value};
    use std::{ffi::c_void, ptr};
    api! {
        napi_get_cb_info: unsafe extern "C" fn(Env, Info, *mut usize, *mut Value, *mut Value, *mut *mut c_void) -> u32,
        napi_typeof: unsafe extern "C" fn(Env, Value, *mut u32) -> u32,
        napi_get_value_double: unsafe extern "C" fn(Env, Value, *mut f64) -> u32,
        napi_get_value_bigint_uint64: unsafe extern "C" fn(Env, Value, *mut u64, *mut bool) -> u32,
        napi_get_value_bigint_int64: unsafe extern "C" fn(Env, Value, *mut i64, *mut bool) -> u32,
        napi_get_buffer_info: unsafe extern "C" fn(Env, Value, *mut *mut c_void, *mut usize) -> u32,
        napi_create_double: unsafe extern "C" fn(Env, f64, *mut Value) -> u32,
        napi_create_int32: unsafe extern "C" fn(Env, i32, *mut Value) -> u32,
        napi_create_function: unsafe extern "C" fn(Env, *const u8, usize, Option<Callback>, *mut c_void, *mut Value) -> u32,
        napi_set_named_property: unsafe extern "C" fn(Env, Value, *const u8, Value) -> u32,
        napi_throw_error: unsafe extern "C" fn(Env, *const u8, *const u8) -> u32,
    }
    pub(super) struct Runtime(Api);
    impl Runtime {
        pub(super) unsafe fn load() -> Option<Self> { Api::load().map(Self) }
        pub(super) unsafe fn fail(&self, env: Env) -> Value {
            (self.0.napi_throw_error)(env, ptr::null(), b"ARTIFACT_WINDOWS_NATIVE_ARGUMENT_INVALID\0".as_ptr());
            ptr::null_mut()
        }
        pub(super) unsafe fn args(&self, env: Env, info: Info, values: &mut [Value]) -> Option<usize> {
            let mut count = values.len();
            if (self.0.napi_get_cb_info)(env, info, &mut count, values.as_mut_ptr(), ptr::null_mut(), ptr::null_mut()) != 0 || count > values.len() {
                return None;
            }
            Some(count)
        }
        pub(super) unsafe fn scalar(&self, env: Env, value: Value) -> Option<usize> {
            let mut kind = 0;
            if (self.0.napi_typeof)(env, value, &mut kind) != 0 { return None; }
            match kind {
                1 => Some(0), // napi_null
                3 => {
                    let mut number = 0.0;
                    if (self.0.napi_get_value_double)(env, value, &mut number) != 0 || !number.is_finite() ||
                        number < 0.0 || number > 9_007_199_254_740_991.0 || number.fract() != 0.0 { return None; }
                    Some(number as usize)
                }
                9 => {
                    let mut number = 0;
                    let mut lossless = false;
                    if (self.0.napi_get_value_bigint_uint64)(env, value, &mut number, &mut lossless) != 0 || !lossless { return None; }
                    Some(number as usize)
                }
                _ => None,
            }
        }
        // Signed Windows INT/BOOL arguments are not pointer/HANDLE tokens.
        // CompareStringOrdinal explicitly admits -1 for NUL-terminated strings.
        pub(super) unsafe fn signed_i32(&self, env: Env, value: Value) -> Option<i32> {
            let mut kind = 0;
            if (self.0.napi_typeof)(env, value, &mut kind) != 0 { return None; }
            match kind {
                3 => {
                    let mut number = 0.0;
                    if (self.0.napi_get_value_double)(env, value, &mut number) != 0 || !number.is_finite() ||
                        number < i32::MIN as f64 || number > i32::MAX as f64 || number.fract() != 0.0 { return None; }
                    Some(number as i32)
                }
                9 => {
                    let mut number = 0;
                    let mut lossless = false;
                    if (self.0.napi_get_value_bigint_int64)(env, value, &mut number, &mut lossless) != 0 || !lossless {
                        return None;
                    }
                    i32::try_from(number).ok()
                }
                _ => None,
            }
        }
        pub(super) unsafe fn integer(&self, env: Env, value: i32) -> Value {
            let mut output = ptr::null_mut();
            if (self.0.napi_create_int32)(env, value, &mut output) != 0 { return self.fail(env); }
            output
        }
        pub(super) unsafe fn pointer(&self, env: Env, value: Value) -> Value {
            let mut data = ptr::null_mut();
            let mut length = 0;
            if (self.0.napi_get_buffer_info)(env, value, &mut data, &mut length) != 0 || data.is_null() || length == 0 {
                return self.fail(env);
            }
            let mut output = ptr::null_mut();
            if data as usize > 9_007_199_254_740_991 || (self.0.napi_create_double)(env, data as usize as f64, &mut output) != 0 {
                return self.fail(env);
            }
            output
        }
        pub(super) unsafe fn export(&self, env: Env, exports: Value, name: &'static [u8], callback: Callback) -> bool {
            let mut function = ptr::null_mut();
            (self.0.napi_create_function)(env, name.as_ptr(), name.len() - 1, Some(callback), ptr::null_mut(), &mut function) == 0 &&
                (self.0.napi_set_named_property)(env, exports, name.as_ptr(), function) == 0
        }
    }
}
static API: OnceLock<napi::Runtime> = OnceLock::new();

unsafe extern "C" fn pointer(env: Env, info: Info) -> Value {
    let Some(api) = API.get() else { return ptr::null_mut(); };
    let mut values = [ptr::null_mut(); 2];
    if api.args(env, info, &mut values) != Some(1) { return api.fail(env); }
    api.pointer(env, values[0])
}

unsafe extern "C" fn invoke(env: Env, info: Info) -> Value {
    let Some(api) = API.get() else { return ptr::null_mut(); };
    let mut values = [ptr::null_mut(); 13];
    let Some(count) = api.args(env, info, &mut values) else { return api.fail(env); };
    if count == 0 || count > 12 { return api.fail(env); }
    let Some(id) = api.scalar(env, values[0]) else { return api.fail(env); };
    let mut a = [0usize; 11];
    let mut signed = [0i32; 3];
    for index in 1..count {
        if id == 9 && matches!(index, 2 | 4 | 5) {
            let Some(value) = api.signed_i32(env, values[index]) else { return api.fail(env); };
            signed[match index { 2 => 0, 4 => 1, _ => 2 }] = value;
            continue;
        }
        let Some(value) = api.scalar(env, values[index]) else { return api.fail(env); };
        a[index - 1] = value;
    }
    let result = match (id, count - 1) {
        (0, 11) => NtCreateFile(a[0] as _, a[1] as _, a[2] as _, a[3] as _, a[4] as _, a[5] as _, a[6] as _, a[7] as _, a[8] as _, a[9] as _, a[10] as _),
        (1, 5) => NtQueryInformationFile(a[0] as _, a[1] as _, a[2] as _, a[3] as _, a[4] as _),
        (2, 9) => NtReadFile(a[0] as _, a[1] as _, a[2] as _, a[3] as _, a[4] as _, a[5] as _, a[6] as _, a[7] as _, a[8] as _),
        (3, 9) => NtWriteFile(a[0] as _, a[1] as _, a[2] as _, a[3] as _, a[4] as _, a[5] as _, a[6] as _, a[7] as _, a[8] as _),
        (4, 11) => NtQueryDirectoryFile(a[0] as _, a[1] as _, a[2] as _, a[3] as _, a[4] as _, a[5] as _, a[6] as _, a[7] as _, a[8] as _, a[9] as _, a[10] as _),
        (5, 5) => NtSetInformationFile(a[0] as _, a[1] as _, a[2] as _, a[3] as _, a[4] as _),
        (6, 1) => NtClose(a[0] as _),
        (7, 3) => QueryDosDeviceW(a[0] as _, a[1] as _, a[2] as _) as i32,
        (8, 4) => GetFinalPathNameByHandleW(a[0] as _, a[1] as _, a[2] as _, a[3] as _) as i32,
        (9, 5) => CompareStringOrdinal(a[0] as _, signed[0], a[2] as _, signed[1], signed[2]),
        (10, 2) => IsWow64Process2(GetCurrentProcess(), a[0] as _, a[1] as _),
        (11, 0) => if cfg!(target_arch = "aarch64") { 0xaa64 } else if cfg!(target_arch = "x86_64") { 0x8664 } else { 0 },
        (12, 3) => IsWow64Process2(a[0] as _, a[1] as _, a[2] as _),
        _ => return api.fail(env),
    };
    api.integer(env, result)
}

#[no_mangle]
pub unsafe extern "C" fn napi_register_module_v1(env: Env, exports: Value) -> Value {
    if API.get().is_none() {
        let Some(api) = napi::Runtime::load() else { return exports; };
        let _ = API.set(api);
    }
    let Some(api) = API.get() else { return exports; };
    if !api.export(env, exports, b"pointer\0", pointer) || !api.export(env, exports, b"invoke\0", invoke) { return api.fail(env); }
    exports
}
