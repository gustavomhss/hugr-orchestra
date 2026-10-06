//! Command lines for `CreateProcessW`, and the protocol's WTF-8 strings as UTF-16.
//!
//! The quoting is ported from Rust std 1.98.0, commit `88d9e12ae178fab0fb5cc050a94da85685d449ea`
//! (MIT OR Apache-2.0): `make_command_line` (`library/std/src/sys/process/windows.rs`) and `append_arg`,
//! `append_bat_arg`, `make_bat_command_line` (`library/std/src/sys/args/windows.rs`), with
//! `force_quotes = false` and regular arguments only (std's defaults). Two deliberate differences, both
//! refusals where std would build a line anyway: a `"` in `argv[0]` (std emits it unescaped; no file name
//! contains one) and a `%` in a batch file's path (cmd.exe expands `%` even inside quotes, and std does
//! not escape the path). A batch file's path first goes through `user_path`, std's `to_user_path`.

use std::ffi::OsString;
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::Path;

const QUOTE: u16 = b'"' as u16;
const BACKSLASH: u16 = b'\\' as u16;
const SPACE: u16 = b' ' as u16;
const TAB: u16 = b'\t' as u16;
const PERCENT: u16 = b'%' as u16;
const CR: u16 = b'\r' as u16;
const LF: u16 = b'\n' as u16;

/// `"argv0" args...`, recoverable by the MSVC rules (`CommandLineToArgvW`, Rust's `args_os`).
pub(super) fn exe(argv0: &[u16], args: &[Vec<u16>]) -> Result<Vec<u16>, &'static str> {
    if argv0.contains(&QUOTE) {
        return Err("argv[0] contains a double quote");
    }
    let mut cmd = vec![QUOTE];
    cmd.extend_from_slice(argv0);
    cmd.push(QUOTE);
    for arg in args {
        cmd.push(SPACE);
        append_arg(&mut cmd, arg);
    }
    Ok(cmd)
}

// std `append_arg` with `Quote::Auto`.
fn append_arg(cmd: &mut Vec<u16>, arg: &[u16]) {
    let quote = arg.is_empty() || arg.iter().any(|&c| c == SPACE || c == TAB);
    if quote {
        cmd.push(QUOTE);
    }
    let mut backslashes = 0;
    for &x in arg {
        if x == BACKSLASH {
            backslashes += 1;
        } else {
            if x == QUOTE {
                // n+1 more backslashes: 2n+1 in total before an inner `"`.
                cmd.extend(std::iter::repeat_n(BACKSLASH, backslashes + 1));
            }
            backslashes = 0;
        }
        cmd.push(x);
    }
    if quote {
        // n more backslashes: 2n in total before the closing `"`.
        cmd.extend(std::iter::repeat_n(BACKSLASH, backslashes));
        cmd.push(QUOTE);
    }
}

/// `cmd.exe /e:ON /v:OFF /d /c ""script" args..."` (std `make_bat_command_line`). Arguments that cannot be
/// passed literally to a batch file (`\r`, `\n`) are refused, as std does.
pub(super) fn bat(script: &[u16], args: &[Vec<u16>]) -> Result<Vec<u16>, &'static str> {
    if script.contains(&QUOTE) || script.last() == Some(&BACKSLASH) {
        return Err("a batch file path may not contain `\"` or end with `\\`");
    }
    if script.contains(&PERCENT) {
        return Err("a batch file whose path contains `%` cannot be run safely");
    }
    let mut cmd: Vec<u16> = "cmd.exe /e:ON /v:OFF /d /c \"".encode_utf16().collect();
    cmd.push(QUOTE);
    cmd.extend_from_slice(script);
    cmd.push(QUOTE);
    for arg in args {
        cmd.push(SPACE);
        if arg.iter().any(|&c| c == CR || c == LF) {
            return Err("a batch file argument cannot contain a line break");
        }
        append_bat_arg(&mut cmd, arg);
    }
    cmd.push(QUOTE);
    Ok(cmd)
}

// std `append_bat_arg` with `quote = false` on entry.
fn append_bat_arg(cmd: &mut Vec<u16>, arg: &[u16]) {
    // Empty, or ending in `\` (which would escape the closing quote of `"%~1"` in the script).
    let mut quote = arg.is_empty() || arg.last() == Some(&BACKSLASH);
    // Every ASCII symbol needs quotes except the known-good ones; Unicode controls too. Unpaired
    // surrogates are skipped, like std's `to_char() == None`.
    const UNQUOTED: &str = r"#$*+-./:?@\_";
    for c in char::decode_utf16(arg.iter().copied()).flatten() {
        if (c.is_ascii() && !(c.is_ascii_alphanumeric() || UNQUOTED.contains(c))) || c.is_control() {
            quote = true;
        }
    }
    if quote {
        cmd.push(QUOTE);
    }
    let mut backslashes = 0;
    for &x in arg {
        if x == BACKSLASH {
            backslashes += 1;
        } else {
            if x == QUOTE {
                // n more backslashes (2n in total), then `""`: a doubled quote is cmd's escape.
                cmd.extend(std::iter::repeat_n(BACKSLASH, backslashes));
                cmd.push(QUOTE);
            } else if x == PERCENT || x == CR {
                // `%` becomes `%%cd:~,%`: an empty substring of %cd%, which keeps cmd from expanding
                // `%VAR%` (needs `/e:ON`).
                cmd.extend("%%cd:~,".encode_utf16());
            }
            backslashes = 0;
        }
        cmd.push(x);
    }
    if quote {
        cmd.extend(std::iter::repeat_n(BACKSLASH, backslashes));
        cmd.push(QUOTE);
    }
}

/// std's `to_user_path` / `from_wide_to_user_path` (same commit, `library/std/src/sys/args/windows.rs`):
/// cmd.exe cannot open a verbatim path, so `\\?\C:\…` becomes `C:\…` and `\\?\UNC\srv\…` becomes `\\srv\…`, but
/// only when the plain spelling names the same file (`GetFullPathNameW` gives it back unchanged) and is short
/// enough (under 260 units, with the NUL). Where std would keep the verbatim spelling (which cmd.exe cannot
/// run), this refuses. A path without the `\\?\` prefix is returned as it is.
pub(super) fn user_path(path: &[u16]) -> Result<Vec<u16>, &'static str> {
    const REFUSED: &str = "a verbatim (\\\\?\\) batch file path has no plain spelling of the same file that \
                           cmd.exe can run (too long, not a drive or UNC path, or it would be normalized)";
    const QUERY: u16 = b'?' as u16;
    const COLON: u16 = b':' as u16;
    const U: u16 = b'U' as u16;
    const N: u16 = b'N' as u16;
    const C: u16 = b'C' as u16;
    let [BACKSLASH, BACKSLASH, QUERY, BACKSLASH, rest @ ..] = path else {
        return Ok(path.to_vec());
    };
    let plain: Vec<u16> = match rest {
        [U, N, C, BACKSLASH, tail @ ..] => [BACKSLASH, BACKSLASH].iter().chain(tail).copied().collect(),
        [_, COLON, BACKSLASH, ..] => rest.to_vec(),
        _ => return Err(REFUSED),
    };
    if path.len() + 1 > 260 {
        return Err(REFUSED);
    }
    let full = std::path::absolute(Path::new(&OsString::from_wide(&plain))).map_err(|_| REFUSED)?;
    if full.as_os_str().encode_wide().eq(plain.iter().copied()) {
        Ok(plain)
    } else {
        Err(REFUSED)
    }
}

/// A protocol OS string (WTF-8, `docs/protocol.md`) as UTF-16. `None` when it is malformed or holds a NUL.
pub(super) fn wide(bytes: &[u8]) -> Option<Vec<u16>> {
    fn cont(bytes: &[u8], i: usize) -> Option<u32> {
        bytes
            .get(i)
            .filter(|&&b| b & 0xC0 == 0x80)
            .map(|&b| u32::from(b & 0x3F))
    }
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while let Some(&b0) = bytes.get(i) {
        let b = u32::from(b0);
        let (cp, len) = match b0 {
            0 => return None,
            0x01..=0x7F => (b, 1),
            0xC2..=0xDF => ((b & 0x1F) << 6 | cont(bytes, i + 1)?, 2),
            // Generalized UTF-8: surrogate code points (ED A0..BF) are WTF-8.
            0xE0..=0xEF => ((b & 0x0F) << 12 | cont(bytes, i + 1)? << 6 | cont(bytes, i + 2)?, 3),
            0xF0..=0xF4 => {
                let cp = (b & 0x07) << 18 | cont(bytes, i + 1)? << 12 | cont(bytes, i + 2)? << 6 | cont(bytes, i + 3)?;
                (cp, 4)
            }
            _ => return None,
        };
        // Overlong forms and code points above U+10FFFF are malformed.
        let shortest = match len {
            1 => 0,
            2 => 0x80,
            3 => 0x800,
            _ => 0x1_0000,
        };
        if cp < shortest || cp > 0x10_FFFF {
            return None;
        }
        match u16::try_from(cp) {
            Ok(unit) => out.push(unit),
            Err(_) => {
                let c = cp - 0x1_0000;
                out.extend([0xD800 | (c >> 10) as u16, 0xDC00 | (c & 0x3FF) as u16]);
            }
        }
        i += len;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(s: &str) -> Vec<u16> {
        s.encode_utf16().collect()
    }

    fn exe_line(prog: &str, args: &[&str]) -> String {
        let args: Vec<Vec<u16>> = args.iter().map(|a| w(a)).collect();
        String::from_utf16_lossy(&exe(&w(prog), &args).unwrap_or_default())
    }

    fn bat_line(args: &[&str]) -> Result<String, &'static str> {
        let args: Vec<Vec<u16>> = args.iter().map(|a| w(a)).collect();
        bat(&w(r"C:\s.bat"), &args).map(|l| String::from_utf16_lossy(&l))
    }

    // The `force_quotes = false` cases of std's own `test_make_command_line` (same commit).
    #[test]
    fn exe_lines_match_std_unit_tests() {
        assert_eq!(exe_line("prog", &["aaa", "bbb", "ccc"]), "\"prog\" aaa bbb ccc");
        assert_eq!(exe_line("prog", &[r"C:\"]), r#""prog" C:\"#);
        assert_eq!(exe_line("prog", &[r"2slashes\\"]), r#""prog" 2slashes\\"#);
        assert_eq!(exe_line("prog", &[r" C:\"]), r#""prog" " C:\\""#);
        assert_eq!(exe_line("prog", &[r" 2slashes\\"]), r#""prog" " 2slashes\\\\""#);
        assert_eq!(
            exe_line("C:\\Program Files\\blah\\blah.exe", &["aaa", "v*"]),
            "\"C:\\Program Files\\blah\\blah.exe\" aaa v*"
        );
        assert_eq!(
            exe_line("C:\\Program Files\\test", &["aa\"bb"]),
            "\"C:\\Program Files\\test\" aa\\\"bb"
        );
        assert_eq!(exe_line("echo", &["a b c"]), "\"echo\" \"a b c\"");
        assert_eq!(
            exe_line("echo", &["\" \\\" \\", "\\"]),
            "\"echo\" \"\\\" \\\\\\\" \\\\\" \\"
        );
        assert_eq!(exe_line("echo", &[""]), "\"echo\" \"\"");
        assert_eq!(exe(&w("a\"b"), &[]), Err("argv[0] contains a double quote"));
    }

    #[test]
    fn bat_lines_quote_every_metacharacter_and_defuse_percent() {
        assert_eq!(
            bat_line(&["a", "b.c"]).as_deref(),
            Ok(r#"cmd.exe /e:ON /v:OFF /d /c ""C:\s.bat" a b.c""#)
        );
        assert_eq!(
            bat_line(&["&calc&"]).as_deref(),
            Ok(r#"cmd.exe /e:ON /v:OFF /d /c ""C:\s.bat" "&calc&"""#)
        );
        assert_eq!(
            bat_line(&["a\"b"]).as_deref(),
            Ok(r#"cmd.exe /e:ON /v:OFF /d /c ""C:\s.bat" "a""b"""#)
        );
        assert_eq!(
            bat_line(&["%PATH%"]).as_deref(),
            Ok(r#"cmd.exe /e:ON /v:OFF /d /c ""C:\s.bat" "%%cd:~,%PATH%%cd:~,%"""#)
        );
        assert_eq!(
            bat_line(&["a\\", ""]).as_deref(),
            Ok(r#"cmd.exe /e:ON /v:OFF /d /c ""C:\s.bat" "a\\" """"#)
        );
        assert!(bat_line(&["a\nb"]).is_err());
        assert!(bat_line(&["a\rb"]).is_err());
        assert!(bat(&w(r"C:\100%\s.bat"), &[]).is_err());
        assert!(bat(&w(r"C:\dir\"), &[]).is_err());
    }

    #[test]
    fn user_path_drops_the_verbatim_prefix_only_when_the_meaning_is_kept() {
        let user = |p: &str| user_path(&w(p)).map(|v| String::from_utf16_lossy(&v));
        assert_eq!(user(r"C:\dir\x.bat").as_deref(), Ok(r"C:\dir\x.bat"));
        assert_eq!(user(r"\\?\C:\dir\x.bat").as_deref(), Ok(r"C:\dir\x.bat"));
        assert_eq!(user(r"\\?\UNC\srv\share\x.cmd").as_deref(), Ok(r"\\srv\share\x.cmd"));
        // Each of these would name another file once plain, or has no plain spelling: refused.
        for p in [
            r"\\?\C:\dir\..\x.bat",
            r"\\?\C:\dir\x.bat.",
            r"\\?\C:\dir/x.bat",
            r"\\?\GLOBALROOT\x.bat",
        ] {
            assert!(user(p).is_err(), "{p}");
        }
        assert!(user(&format!(r"\\?\C:\{}\x.bat", "d".repeat(250))).is_err(), "too long");
    }

    #[test]
    fn wtf8_decodes_utf8_and_lone_surrogates_and_refuses_the_rest() {
        assert_eq!(wide("a é 日 😀".as_bytes()), Some(w("a é 日 😀")));
        assert_eq!(wide(&[0xED, 0xA0, 0x80]), Some(vec![0xD800]));
        for bad in [
            &[0][..],
            &[0xC0, 0x80],
            &[0xE0, 0x80, 0x80],
            &[0xF4, 0x90, 0x80, 0x80],
            &[0xE6, 0x97],
            &[0xFF],
        ] {
            assert_eq!(wide(bad), None, "{bad:x?}");
        }
    }
}
