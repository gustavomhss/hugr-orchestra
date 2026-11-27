//! Activity observation runs Job inventory off the tree owner. The owner alone admits observations and replies.

use std::io;
use std::os::windows::io::OwnedHandle;

use omni_proto::{Ack, Msg, ProcEntry};

use super::queues::Event;
use super::{Supervisor, channel};

impl Supervisor {
    pub(super) fn observe(
        &mut self,
        req: u64,
        id: u64,
        scan: impl FnOnce(&OwnedHandle, Option<u32>) -> io::Result<Vec<ProcEntry>> + Send + 'static,
    ) -> Option<Msg> {
        let busy = self.observation.is_some();
        let result = match self.live(id) {
            None => Ack::Unknown,
            Some(t) if t.gone => {
                return Some(Msg::Processes {
                    req,
                    id,
                    list: Vec::new(),
                });
            }
            Some(_) if busy => Ack::Error,
            Some(t) => {
                let exclude = t.exit.map(|_| t.pid);
                let job = t.inventory_job().and_then(OwnedHandle::try_clone);
                let inbox = self.inbox.clone();
                let started = job.and_then(|job| {
                    channel::helper("observe", move || {
                        let result = scan(&job, exclude);
                        drop(job);
                        inbox.event(Event::Observed(result));
                    })
                });
                if started.is_ok() {
                    self.observation = Some((req, id));
                    return None;
                }
                Ack::Error
            }
        };
        Some(Msg::Ack { req, id, result })
    }

    pub(super) fn observed(&mut self, result: io::Result<Vec<ProcEntry>>) {
        let Some((req, id)) = self.observation.take() else {
            return;
        };
        if self.host_gone.is_some() {
            return;
        }
        let reply = match self.live(id) {
            None => Msg::Ack {
                req,
                id,
                result: Ack::Unknown,
            },
            Some(t) if t.gone => Msg::Processes {
                req,
                id,
                list: Vec::new(),
            },
            Some(t) => match result {
                Ok(mut list) => {
                    // The root may have exited after the worker sampled it, leaving live descendants.
                    if t.exit.is_some() {
                        list.retain(|p| p.pid != t.pid);
                        for p in list.iter_mut().filter(|p| p.ppid == Some(t.pid)) {
                            p.ppid = None;
                        }
                    }
                    Msg::Processes { req, id, list }
                }
                Err(_) => Msg::Ack {
                    req,
                    id,
                    result: Ack::Error,
                },
            },
        };
        self.send(&reply);
    }
}
