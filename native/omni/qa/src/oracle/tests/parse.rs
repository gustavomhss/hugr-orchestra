//! The parsers on the shapes the OS tools print (Linux `/proc`, macOS `ps`, Windows CIM).

use std::collections::HashMap;

use super::super::token;
use super::super::unix::{command_lines, marker_in_environ, parse_ps_line, parse_stat};
use super::super::windows::parse_line;

#[test]
fn linux_stat_and_environ() {
    let tail = "0 -1 4194560 100 0 0 0 1 2 0 0 20 0 1 0 987654 1000 10";
    let stat = format!("4321 (omni fix (x)) S 4000 4321 4321 {tail}");
    let p = parse_stat(4321, &stat).unwrap().unwrap();
    assert_eq!(
        (p.ppid, p.pgid, p.created, p.name.as_str()),
        (4000, 4321, 987654, "omni fix (x)")
    );
    assert_eq!(
        parse_stat(4321, &format!("4321 (sh) Z 1 4321 4321 {tail}")).unwrap(),
        None
    );
    assert!(parse_stat(4321, "4321 (sh) S 1 4321 4321").is_err());
    let env = b"A=1\0HUGR_QA_TASK=q-1-\0B=2\0";
    assert_eq!(marker_in_environ(env).as_deref(), Some("q-1-"));
    assert_eq!(marker_in_environ(b"XHUGR_QA_TASK=q-1-\0"), None);
}

/// macOS: the marker counts only as an exact `HUGR_QA_TASK=<value>` word of the environment, which is what follows
/// the process's own command line (from the `ps` without `-E`). In argv, under another name, glued to another word, or
/// when the command lines do not line up, it is no marker.
#[test]
fn macos_ps_lines() {
    let args =
        "  812 /usr/local/bin/node vite.js\n   90 /bin/sh -c vite\n  93 fx HUGR_QA_TASK=q-1-\n  94 fx\n  95 fx\n";
    let argv = command_lines(args);
    assert_eq!(argv.get(&812), Some(&"/usr/local/bin/node vite.js"));
    let ps = |line: &str| parse_ps_line(line, &argv).unwrap().unwrap();
    let p =
        ps("  812   1   800 S    Sun Oct  4 02:31:07 2026     /usr/local/bin/node vite.js HUGR_QA_TASK=q-1- TERM=x");
    assert_eq!((p.pid, p.ppid, p.pgid, p.created), (812, 1, 800, 20261004023107));
    assert_eq!((p.name.as_str(), p.tag.as_deref()), ("node", Some("q-1-")));
    let hidden = ps("  90  89  89 S+   Mon Jan 12 10:00:00 2026 /bin/sh -c vite");
    assert_eq!((hidden.name.as_str(), hidden.tag), ("sh", None));
    let not_ours = [
        "  93   1  93 S    Mon Jan 12 10:00:00 2026 fx HUGR_QA_TASK=q-1- A=1", // only in argv
        "  94   1  94 S    Mon Jan 12 10:00:00 2026 fx OTHER_HUGR_QA_TASK=q-1-", // another variable
        "  95   1  95 S    Mon Jan 12 10:00:00 2026 fx X=HUGR_QA_TASK=q-1-",   // inside another value
        "  96   1  96 S    Mon Jan 12 10:00:00 2026 fx HUGR_QA_TASK=q-1-",     // no command line to split on
        "  95   1  95 S    Mon Jan 12 10:00:00 2026 fxHUGR_QA_TASK=q-1-",      // does not follow its command line
    ];
    for line in not_ours {
        assert_eq!(ps(line).tag, None, "{line}");
    }
    assert_eq!(
        parse_ps_line("  91  89  89 Z    Mon Jan 12 10:00:00 2026 (sh)", &argv).unwrap(),
        None
    );
    assert!(parse_ps_line("  92  89  89 S    Mon Foo 12 10:00:00 2026 x", &HashMap::new()).is_err());
    let (a, b) = (token(), token());
    assert!(
        a.len() == 32 && a.bytes().all(|c| c.is_ascii_hexdigit()) && a != b,
        "{a} {b}"
    );
}

#[test]
fn windows_cim_lines() {
    let p = parse_line("4321 4000 134049600000000000 omni fixture.exe").unwrap();
    assert_eq!((p.pid, p.ppid, p.created), (4321, 4000, 134049600000000000));
    assert_eq!(p.name, "omni fixture.exe");
    assert!(parse_line("4321 x 1 a").is_err());
}
