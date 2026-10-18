//! A spawn whose message is larger than the channel's socket buffer (a large environment) still starts, with its
//! pipes: macOS refuses such a message whole when descriptors ride on it (EMSGSIZE).

use std::time::Duration;

use super::{binary, block, use_supervisor};
use crate::api::Command;

#[test]
fn a_spawn_with_a_large_environment_starts() {
    use_supervisor();
    let fixture = binary("omni-fixture");
    // 64 KiB: far above the 8 KiB socket buffer, under Linux's 128 KiB limit for one environment string.
    let big = "x".repeat(64 * 1024);
    block(async {
        let mut cmd = Command::new(&fixture);
        cmd.arg("getenv=OMNI_BIG")
            .env("OMNI_BIG", &big)
            .timeout(Duration::from_secs(30));
        let out = cmd.run().await.expect("run");
        assert!(out.exit.success(), "{:?}", out.exit);
        let text = out.stdout.to_string();
        assert!(
            text.starts_with("OMNI_BIG=\"xxx") && text.trim_end().len() == big.len() + 11,
            "{}",
            &text[..text.len().min(80)]
        );
    });
}
