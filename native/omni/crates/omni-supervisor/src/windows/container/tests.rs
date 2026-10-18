//! The launch request parser: every path absolute, a bounded profile name, and `--app`/`--line` unless revoking.

use super::parse;

fn args(list: &[&str]) -> impl Iterator<Item = String> {
    list.iter().map(|s| (*s).to_owned()).collect::<Vec<_>>().into_iter()
}

#[test]
fn parses_grants_routes_and_the_command() {
    let request = parse(args(&[
        "orchestra-abc",
        "--read",
        r"C:\w",
        "--write",
        r"C:\w\out",
        "--route",
        r"5432=C:\t\0.sock",
        "--app",
        r"C:\pwsh.exe",
        "--line",
        "pwsh -Command x",
    ]))
    .unwrap();
    assert_eq!(request.name, "orchestra-abc");
    assert_eq!(request.grants.len(), 2);
    assert_eq!(request.routes.len(), 1);
    assert_eq!(request.routes[0].port, 5432);
    assert_eq!(request.line.as_deref(), Some("pwsh -Command x"));
    assert!(!request.revoke);
}

#[test]
fn refuses_relative_paths_bad_names_ports_and_missing_commands() {
    for bad in [
        &["orchestra", "--read", r"w", "--app", "a", "--line", "l"][..],
        &["orchestra", "--toolchain", r"go"],
        &["orchestra", "--toolchain", r"C:\go", "--app", "a", "--line", "l"],
        &["orchestra", "--toolchain", r"C:\go", "--read", r"C:\w"],
        &["orchestra", "--toolchain", r"C:\go", "--revoke"],
        &["orchestra", "--route", r"0=C:\t\0.sock", "--app", "a", "--line", "l"],
        &["orchestra", "--route", r"5432", "--app", "a", "--line", "l"],
        &["bad name", "--app", "a", "--line", "l"],
        &[&"x".repeat(65), "--app", "a", "--line", "l"],
        &["orchestra", "--read", r"C:\w"],
        &["orchestra", "--unknown", "v", "--app", "a", "--line", "l"],
    ] {
        assert!(parse(args(bad)).is_err(), "{bad:?}");
    }
    assert_eq!(
        parse(args(&["orchestra", "--toolchain", r"C:\go"])).unwrap().toolchain,
        [std::path::PathBuf::from(r"C:\go")]
    );
    assert!(
        parse(args(&["orchestra", "--read", r"C:\w", "--revoke"]))
            .unwrap()
            .revoke
    );
}
