//! Tree inventory and observational requests.

use omni_proto::{Ack, Msg};

use super::{Answer, Class, Error, InventoryFailure, ProcEntry, Tree, Want};
#[cfg(all(test, target_os = "linux"))]
use super::inventory_probe;

impl Tree {
    /// The live processes `stop` would end now; `[]` once gone; `Io` if the inventory is incomplete.
    pub(crate) async fn processes(&self) -> Result<Vec<ProcEntry>, Error> {
        self.inventory().await.map_err(InventoryFailure::into_error)
    }

    pub(crate) async fn observe_processes(&self) -> Result<Vec<ProcEntry>, Error> {
        self.list(Want::ObserveList).await
    }

    pub(crate) async fn observe_tree(&self) -> Result<(Vec<ProcEntry>, Option<u64>, Option<String>), Error> {
        self.sup.home()?;
        if !self.sup.footprints() {
            return Ok((self.observe_processes().await?, None, None));
        }
        let life = *self.life.borrow();
        if life.gone {
            return Ok((Vec::new(), None, None));
        }
        if life.lost {
            return Err(self.lost());
        }
        let id = self.id;
        let answer = self
            .sup
            .ask(Want::ObserveFootprint, id, Class::Normal, |req| Msg::ObserveFootprint {
                req,
                id,
            })
            .await?;
        self.sup.home()?;
        match answer {
            Answer::ObservedTree(list, footprint, identity) => Ok((list, footprint, identity)),
            other => Err(self.refused("ObserveFootprint", &other)),
        }
    }

    async fn list(&self, want: Want) -> Result<Vec<ProcEntry>, Error> {
        self.inventory_with(want).await.map_err(InventoryFailure::into_error)
    }

    /// Classifies the actual List boundary for resource watchers without conflating failure with an empty tree.
    pub(crate) async fn inventory(&self) -> Result<Vec<ProcEntry>, InventoryFailure> {
        self.inventory_with(Want::List).await
    }

    async fn inventory_with(&self, want: Want) -> Result<Vec<ProcEntry>, InventoryFailure> {
        self.sup.home().map_err(InventoryFailure::Terminal)?;
        let life = *self.life.borrow();
        if life.gone {
            return Ok(Vec::new());
        }
        if life.lost {
            return Err(InventoryFailure::Terminal(self.lost()));
        }
        if !self.sup.alive() {
            return Err(InventoryFailure::Terminal(self.sup.gone()));
        }
        let id = self.id;
        let answer = self
            .sup
            .ask(want, id, Class::Normal, |req| {
                if want == Want::ObserveList {
                    Msg::Observe { req, id }
                } else {
                    Msg::List { req, id }
                }
            })
            .await;
        // Recheck home before subsequent state inspection.
        self.sup.home().map_err(InventoryFailure::Terminal)?;
        let answer = answer.map_err(|error| {
            // For this fixed-size List, a live generation's error was refused before send (normal admission).
            // Every post-registration failure ends the generation; do not retry through that lost channel.
            match self.sup.alive() {
                true => InventoryFailure::Retryable(error),
                false => InventoryFailure::Terminal(error),
            }
        })?;
        match answer {
            Answer::Processes(list) => {
                #[cfg(all(test, target_os = "linux"))]
                self.probe
                    .received(inventory_probe::Receipt::Listed(list.iter().map(|p| p.pid).collect()))
                    .await;
                Ok(list)
            }
            other => {
                let name = if want == Want::ObserveList { "Observe" } else { "List" };
                let error = self.refused(name, &other);
                let failure = match &other {
                    Answer::Ack(Ack::Error) if self.sup.alive() => InventoryFailure::Retryable(error),
                    _ => InventoryFailure::Terminal(error),
                };
                #[cfg(all(test, target_os = "linux"))]
                if matches!(&other, Answer::Ack(Ack::Error)) {
                    self.probe.received(inventory_probe::Receipt::Incomplete).await;
                }
                Err(failure)
            }
        }
    }

    #[cfg(all(test, target_os = "linux"))]
    pub(crate) fn inventory_probe(&self) -> Result<inventory_probe::Watch, Error> {
        self.sup.home()?;
        Ok(self.probe.attach())
    }

}
