//! Spawn failure replies.

use omni_proto::Msg;

use super::{Closed, Sup, spawn::Fail};

impl Sup {
    pub(super) fn fail(&mut self, req: u64, f: Fail) -> Result<(), Closed> {
        let msg = Msg::SpawnFailed {
            req,
            code: f.code,
            errno: f.errno,
            msg: f.msg,
        };
        self.chan.send(&msg, None).map_err(|e| Closed::Proto(e.0))
    }
}
