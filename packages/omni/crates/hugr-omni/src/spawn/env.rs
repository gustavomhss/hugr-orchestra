//! The child's final environment (C-ENV-01). W03.

use std::ffi::{OsStr, OsString};

use super::{HOST, Os, Request};

/// Inherited (unless `inherit_env` is false) + overrides in call order; keys case-insensitive on Windows.
pub(super) fn build(req: &Request) -> Vec<(OsString, OsString)> {
    merge(std::env::vars_os(), &req.env, req.inherit_env, HOST)
}

/// The rule behind `build`, with the host's environment as input. Without `inherit` the start is empty, except
/// that Windows keeps the host's `SystemRoot` (contract §3: many programs cannot start without it). Each override
/// then replaces every variable of the same name, or removes it (`None`). Nothing is expanded.
pub(super) fn merge(
    host: impl IntoIterator<Item = (OsString, OsString)>,
    overrides: &[(OsString, Option<OsString>)],
    inherit: bool,
    os: Os,
) -> Vec<(OsString, OsString)> {
    let mut env: Vec<(OsString, OsString)> = match (inherit, os) {
        (true, _) => host.into_iter().collect(),
        (false, Os::Windows) => host
            .into_iter()
            .filter(|(name, _)| os.same_name(name, OsStr::new("SystemRoot")))
            .take(1)
            .collect(),
        (false, Os::Unix) => Vec::new(),
    };
    for (name, value) in overrides {
        env.retain(|(n, _)| !os.same_name(n, name));
        if let Some(value) = value {
            env.push((name.clone(), value.clone()));
        }
    }
    env
}

/// The value of variable `name` in `env`, names compared by the rule of `os`.
pub(super) fn get<'a>(env: &'a [(OsString, OsString)], name: &str, os: Os) -> Option<&'a OsStr> {
    env.iter()
        .find(|(n, _)| os.same_name(n, OsStr::new(name)))
        .map(|(_, value)| value.as_os_str())
}

impl Os {
    /// Unix compares names exactly. Windows compares them by ordinal ignoring case over the whole UTF-16 sequence,
    /// like `CompareStringOrdinal(.., TRUE)`: unit against unit, each through `fold`.
    fn same_name(self, a: &OsStr, b: &OsStr) -> bool {
        match self {
            Os::Unix => a == b,
            Os::Windows => {
                let (a, b) = (utf16(a), utf16(b));
                a.len() == b.len() && a.iter().zip(&b).all(|(&x, &y)| fold(x) == fold(y))
            }
        }
    }
}

/// A UTF-16 unit through its simple upper case when it is a non-surrogate BMP character whose upper case is
/// exactly one BMP character; any other unit, surrogates included, unchanged (Windows' table works this way:
/// `ß` stays `ß`).
fn fold(unit: u16) -> u16 {
    let Some(c) = char::from_u32(u32::from(unit)) else {
        return unit;
    };
    let mut upper = c.to_uppercase();
    match (upper.next(), upper.next()) {
        (Some(u), None) => u16::try_from(u32::from(u)).unwrap_or(unit),
        _ => unit,
    }
}

/// The UTF-16 units of a Windows string, unpaired surrogates included.
#[cfg(windows)]
fn utf16(s: &OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    s.encode_wide().collect()
}

/// Off Windows (the Windows rules under test): the bytes read as WTF-8, the form a Windows string has inside
/// Rust, so an unpaired surrogate (`ED A0..BF 80..BF`) is one unit; any other invalid byte becomes U+FFFD.
#[cfg(unix)]
fn utf16(s: &OsStr) -> Vec<u16> {
    let mut units = Vec::new();
    let mut rest = s.as_encoded_bytes();
    while !rest.is_empty() {
        let valid_up_to = std::str::from_utf8(rest).map_or_else(|err| err.valid_up_to(), str::len);
        let (valid, bad) = rest.split_at(valid_up_to);
        units.extend(std::str::from_utf8(valid).unwrap_or_default().encode_utf16());
        rest = match bad {
            [0xED, high @ 0xA0..=0xBF, low @ 0x80..=0xBF, tail @ ..] => {
                units.push(0xD000 | u16::from(high & 0x3F) << 6 | u16::from(low & 0x3F));
                tail
            }
            [_, tail @ ..] => {
                units.push(0xFFFD);
                tail
            }
            [] => bad,
        };
    }
    units
}
