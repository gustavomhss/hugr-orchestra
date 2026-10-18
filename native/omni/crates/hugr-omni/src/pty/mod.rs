//! Host side of a terminal child (W12). It needs no code of its own: the terminal's output is read by the
//! `io` pumps (`Source::Pty`, whose reader runs before `Pumps::start` returns), what is typed goes through
//! `io::Stdin`, and the held Unix root's `Go` and `Resize` are `client::Tree` requests. `process::spawn_pty`
//! wires them in the order ADR-0005 R9 needs: reader first, then `Go`. This module holds the host-side suite.

#[cfg(test)]
mod tests;
