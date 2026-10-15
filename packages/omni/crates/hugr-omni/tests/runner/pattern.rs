//! Scenario regexes: only a subset that JavaScript (with the `u` flag: matching by code point) and Rust's `regex`
//! read the same way (SPEC). Each pattern is checked against a whitelist and rewritten so Rust means what JavaScript
//! means: `\d` `\D` `\w` `\W` become explicit ASCII classes and `.` excludes JavaScript's line terminators
//! (`\n \r U+2028 U+2029`). `conformance/regex-table.json` is the differential table every runner checks.

use regex::Regex;

/// Compiles a scenario regex, or says which construct is outside the subset.
pub fn pattern(re: &str) -> Result<Regex, String> {
    let rust = translate(re).map_err(|e| format!("regex {re:?} uses {e}, outside the JS/Rust subset (SPEC)"))?;
    Regex::new(&rust).map_err(|e| format!("regex {re:?}: {e}"))
}

/// The subset: literals; `^ $ | * + ? *? +? ??`; `{n}` `{n,}` `{n,m}`; `( )` and `(?: )`; classes without nesting,
/// set operators or ranges next to a class escape; escapes `\d \D \w \W` (`\d \w` inside a class), `\n \r \t \f
/// \v`, `\xHH`, `\uHHHH` (not a surrogate), and escaped syntax characters (`\-` only inside a class, as under the
/// `u` flag). Everything else (look-around, backreferences, named groups, flags, `\s`, `\b`, `\p`, Rust-only
/// syntax) is refused.
fn translate(re: &str) -> Result<String, String> {
    let mut out = String::with_capacity(re.len());
    let mut chars = re.chars().peekable();
    let mut class = false;
    // Inside a class: the last item was a class escape (`\d`, `\w`), or a `-` that could start a range.
    let (mut after_escape, mut after_dash) = (false, false);
    // Outside a class: what a quantifier would repeat (JS `u` refuses a quantifier on nothing or on a quantifier).
    let mut prev = Prev::Nothing;
    while let Some(c) = chars.next() {
        let (was_escape, was_dash) = (std::mem::take(&mut after_escape), std::mem::take(&mut after_dash));
        match c {
            '\\' => {
                let e = chars.next().ok_or("a trailing backslash")?;
                match (e, class) {
                    ('d', false) => out.push_str("[0-9]"),
                    ('D', false) => out.push_str("[^0-9]"),
                    ('w', false) => out.push_str("[0-9A-Za-z_]"),
                    ('W', false) => out.push_str("[^0-9A-Za-z_]"),
                    ('d' | 'w', true) if was_dash => return Err("a range ending in a class escape".into()),
                    ('d', true) => {
                        out.push_str("0-9");
                        after_escape = true;
                    }
                    ('w', true) => {
                        out.push_str("0-9A-Za-z_");
                        after_escape = true;
                    }
                    ('n' | 'r' | 't' | 'f' | 'v', _) => out.extend(['\\', e]),
                    ('x' | 'u', _) => {
                        let n = if e == 'x' { 2 } else { 4 };
                        let hex: String = (0..n).filter_map(|_| chars.next_if(char::is_ascii_hexdigit)).collect();
                        if hex.len() != n {
                            return Err(format!("\\{e} without {n} hex digits"));
                        }
                        if u32::from_str_radix(&hex, 16).is_ok_and(|v| (0xD800..=0xDFFF).contains(&v)) {
                            return Err("a surrogate escape (JS pairs them, Rust refuses them)".into());
                        }
                        out.push_str(&format!("\\x{{{hex}}}"));
                    }
                    ('-', true) => out.push_str("\\-"),
                    (p, _) if "\\^$.|?*+()[]{}".contains(p) => out.extend(['\\', p]),
                    ('/', _) => out.push('/'),
                    _ => return Err(format!("the escape \\{e}")),
                }
                if !class {
                    prev = Prev::Atom;
                }
            }
            '[' if !class => {
                class = true;
                out.push('[');
                if chars.next_if_eq(&'^').is_some() {
                    out.push('^');
                }
                if chars.peek() == Some(&']') {
                    return Err("an empty class or a leading ] in a class".into());
                }
            }
            '[' => return Err("a nested class or an unescaped [ in a class".into()),
            ']' if class => {
                class = false;
                prev = Prev::Atom;
                out.push(']');
            }
            '&' | '-' | '~' if class && chars.peek() == Some(&c) => return Err(format!("the class operator {c}{c}")),
            '-' if class && was_escape && chars.peek() != Some(&']') => {
                return Err("a range starting at a class escape".into());
            }
            '-' if class => {
                after_dash = true;
                out.push('-');
            }
            _ if class => out.push(c),
            '.' => {
                prev = Prev::Atom;
                out.push_str(r"[^\n\r\x{2028}\x{2029}]");
            }
            '(' if chars.next_if_eq(&'?').is_some() => {
                if chars.next_if_eq(&':').is_none() {
                    return Err("look-around, a named group or an inline flag".into());
                }
                prev = Prev::Nothing;
                out.push_str("(?:");
            }
            '(' | '|' | '^' | '$' => {
                prev = Prev::Nothing;
                out.push(c);
            }
            ')' => {
                prev = Prev::Atom;
                out.push(c);
            }
            '*' | '+' | '?' => {
                prev = prev.quantified(c == '?')?;
                out.push(c);
            }
            '{' => {
                prev = prev.quantified(false)?;
                let body: String = std::iter::from_fn(|| chars.next_if(|&c| c != '}')).collect();
                let counted = body
                    .split_once(',')
                    .map_or(body.as_str(), |(n, m)| if m.is_empty() { n } else { m });
                let digits = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit());
                if chars.next() != Some('}') || !digits(body.split(',').next().unwrap_or("")) || !digits(counted) {
                    return Err("a { that is not a {n}, {n,} or {n,m} quantifier (escape it)".into());
                }
                out.push_str(&format!("{{{body}}}"));
            }
            '}' | ']' => return Err(format!("a lone {c} (escape it)")),
            c => {
                prev = Prev::Atom;
                out.push(c);
            }
        }
    }
    if class {
        return Err("an unclosed class".into());
    }
    Ok(out)
}

/// What precedes a quantifier.
#[derive(Clone, Copy, PartialEq)]
enum Prev {
    /// The start, `(`, `(?:`, `|`, `^` or `$`: nothing to repeat.
    Nothing,
    Atom,
    Quantifier,
    /// A quantifier made lazy with `?`.
    Lazy,
}

impl Prev {
    /// After a quantifier; `lazy`: it is a `?`, which after a quantifier makes it lazy.
    fn quantified(self, lazy: bool) -> Result<Prev, String> {
        match self {
            Prev::Atom => Ok(Prev::Quantifier),
            Prev::Quantifier if lazy => Ok(Prev::Lazy),
            _ => Err("a quantifier with nothing to repeat (after an assertion, `(`, `|` or another quantifier)".into()),
        }
    }
}
