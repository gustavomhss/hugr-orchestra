use crate::codec::{decode, encode};
use crate::{ControlMember, FreezeOutcome, Msg};

#[test]
fn freeze_wire_round_trips_and_rejects_invalid_discriminants() {
    for paused in [false, true] {
        round_trip(
            Msg::ControlFreeze {
                req: 98,
                id: 7,
                member: ControlMember { pid: 42, birth: 123 },
                paused,
            },
            0x0b,
        );
    }
    for outcome in [FreezeOutcome::Changed, FreezeOutcome::Refused, FreezeOutcome::Unknown] {
        round_trip(Msg::ControlFreezeResult { req: 99, id: 7, outcome }, 0x8b);
    }
}

fn round_trip(message: Msg, tag: u8) {
    let mut frame = Vec::new();
    encode(&message, &mut frame).unwrap();
    assert_eq!(frame[4], tag);
    assert_eq!(decode(&frame).unwrap(), Some((message, frame.len())));
    *frame.last_mut().unwrap() = 0xff;
    assert!(decode(&frame).is_err());
}
