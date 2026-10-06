//! For the language bindings only (hidden from the docs): the contract §3 rules for numbers that only TS and Python
//! can express wrongly (NaN, infinities, negatives, fractions), with the same error texts as every other check.
//! Rust callers never need it: `Duration`, `usize` and `u16` cannot hold those values. W03.
//!
//! SEAM (frozen in W00): `millis`, `byte_limit`, `pty_side`. Bodies belong to W03.

use std::time::Duration;

use crate::error::Error;

/// The largest `timeoutMs` / `graceMs` (the protocol carries them as u32 milliseconds).
const MAX_MS: f64 = 4_294_967_295.0;
/// 2^64: every integral `f64` below it fits a `u64` exactly.
const TWO_POW_64: f64 = 18_446_744_073_709_551_616.0;

/// `timeoutMs` / `graceMs`: finite, from 0 to 4294967295; a fraction rounds up to the next millisecond.
pub fn millis(field: &str, value: f64) -> Result<Duration, Error> {
    // NaN fails both comparisons; -0.0 counts as 0.
    if value >= 0.0 && value.ceil() <= MAX_MS {
        Ok(Duration::from_millis(value.ceil() as u64))
    } else {
        Err(Error::duration_out_of_range(field, shown(value)))
    }
}

/// `maxOutputBytes`: an integer from 0.
pub fn byte_limit(field: &str, value: f64) -> Result<usize, Error> {
    // NaN and the infinities fail the comparison or have a NaN fraction; `usize` may be narrower than `u64`.
    if value >= 0.0
        && value.fract() == 0.0
        && value < TWO_POW_64
        && let Ok(bytes) = usize::try_from(value as u64)
    {
        return Ok(bytes);
    }
    Err(Error::bad_byte_limit(field, shown(value)))
}

/// `pty.cols` / `pty.rows`: an integer from 1 to 32767.
pub fn pty_side(field: &str, value: f64) -> Result<u16, Error> {
    if value.fract() == 0.0 && (1.0..=32767.0).contains(&value) {
        Ok(value as u16)
    } else {
        Err(Error::bad_pty_size(field, shown(value)))
    }
}

/// A number as the user wrote it in TS or Python: `NaN`, `Infinity`, `-Infinity`, `1.5`, `-1`.
fn shown(value: f64) -> String {
    match (value.is_infinite(), value > 0.0) {
        (true, true) => "Infinity".to_owned(),
        (true, false) => "-Infinity".to_owned(),
        (false, _) => value.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    #[track_caller]
    fn refused<T: std::fmt::Debug>(result: Result<T, Error>, text: &str) {
        let err = result.unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidArgument);
        assert!(err.to_string().contains(text), "{err} lacks {text:?}");
    }

    #[test]
    fn millis_are_finite_non_negative_and_round_up() {
        assert_eq!(millis("timeoutMs", 0.0).unwrap(), Duration::ZERO);
        assert_eq!(millis("timeoutMs", -0.0).unwrap(), Duration::ZERO);
        assert_eq!(millis("timeoutMs", 0.001).unwrap(), Duration::from_millis(1));
        assert_eq!(millis("graceMs", 1500.2).unwrap(), Duration::from_millis(1501));
        assert_eq!(
            millis("timeoutMs", MAX_MS).unwrap(),
            Duration::from_millis(4_294_967_295)
        );
        refused(millis("timeoutMs", MAX_MS + 0.5), "timeoutMs is 4294967295.5;");
        refused(millis("timeoutMs", f64::NAN), "timeoutMs is NaN;");
        refused(millis("graceMs", f64::INFINITY), "graceMs is Infinity;");
        refused(millis("graceMs", f64::NEG_INFINITY), "graceMs is -Infinity;");
        refused(millis("timeoutMs", -1.0), "timeoutMs is -1;");
        refused(
            millis("timeoutMs", -0.5),
            "timeoutMs is -0.5; it must be a number of milliseconds from 0",
        );
    }

    #[test]
    fn byte_limits_are_whole_non_negative_numbers() {
        assert_eq!(byte_limit("maxOutputBytes", 0.0).unwrap(), 0);
        assert_eq!(byte_limit("maxOutputBytes", 16_777_216.0).unwrap(), 16 << 20);
        refused(
            byte_limit("maxOutputBytes", 1.5),
            "maxOutputBytes is 1.5; it must be a whole number of bytes",
        );
        refused(byte_limit("maxOutputBytes", -1.0), "maxOutputBytes is -1;");
        refused(byte_limit("maxOutputBytes", f64::NAN), "maxOutputBytes is NaN;");
        refused(
            byte_limit("maxOutputBytes", f64::INFINITY),
            "maxOutputBytes is Infinity;",
        );
        refused(
            byte_limit("maxOutputBytes", TWO_POW_64),
            "maxOutputBytes is 18446744073709552000;",
        );
    }

    #[test]
    fn pty_sides_are_whole_numbers_from_1_to_32767() {
        assert_eq!(pty_side("pty.cols", 1.0).unwrap(), 1);
        assert_eq!(pty_side("pty.rows", 32767.0).unwrap(), 32767);
        refused(pty_side("pty.cols", 0.0), "pty.cols is 0;");
        refused(pty_side("pty.rows", 32768.0), "pty.rows is 32768;");
        refused(
            pty_side("pty.cols", 80.5),
            "pty.cols is 80.5; a terminal side must be a whole number",
        );
        refused(pty_side("pty.cols", -24.0), "pty.cols is -24;");
        refused(pty_side("pty.rows", f64::NAN), "pty.rows is NaN;");
    }
}
