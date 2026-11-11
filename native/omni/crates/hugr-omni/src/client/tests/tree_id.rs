//! Generation-qualified tree identities come from real channel spawn replies without numeric loss.

use omni_proto::Msg;

use super::{BOUND, READY, connect, spec};

#[test]
fn tree_identity_is_generation_qualified_stable_and_exact() {
    let identities = [(1, 1), (2, 1), (u64::MAX, u64::MAX)].map(|(generation, id)| {
        let (sup, mut peer) = connect(generation, BOUND, &READY);
        let sup = sup.expect("start");
        let caller = std::thread::spawn(move || super::super::spawn_on(&sup, &spec(false)));
        let Msg::Spawn(spawn) = peer.next().expect("spawn request") else {
            panic!("expected Spawn");
        };
        peer.send(&Msg::Spawned {
            req: spawn.req,
            id,
            pid: 777,
            pty_ends: [0, 0],
        });
        let spawned = caller.join().expect("join").expect("spawn");
        let identity = spawned.tree.tree_id();
        assert_eq!(spawned.tree.tree_id(), identity);
        identity
    });
    assert_eq!(identities[0], "1:1");
    assert_eq!(identities[1], "2:1");
    assert_ne!(identities[0], identities[1]);
    assert_eq!(identities[2], "18446744073709551615:18446744073709551615");
}
