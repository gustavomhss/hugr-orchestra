//! What a `Proc` has read so far, with terminal escape sequences removed, and where the last match ended.

/// The output read so far, terminal escape sequences removed (also when one is split across chunks), and where the
/// last match ended.
#[derive(Default)]
pub struct Seen {
    text: String,
    at: usize,
    escape: Escape,
}

#[derive(Default, PartialEq)]
enum Escape {
    #[default]
    None,
    Esc,
    Csi,
    Osc,
    OscEsc,
}

impl Seen {
    pub fn push(&mut self, chunk: &str) {
        for c in chunk.chars() {
            self.escape = match (&self.escape, c) {
                (Escape::None, '\u{1b}') => Escape::Esc,
                (Escape::None, c) => {
                    self.text.push(c);
                    Escape::None
                }
                (Escape::Esc, '[') => Escape::Csi,
                (Escape::Esc, ']') => Escape::Osc,
                (Escape::Esc, _) => Escape::None,
                (Escape::Csi, '\u{40}'..='\u{7e}') => Escape::None,
                (Escape::Csi, _) => Escape::Csi,
                (Escape::Osc, '\u{7}') => Escape::None,
                (Escape::Osc, '\u{1b}') => Escape::OscEsc,
                (Escape::Osc, _) => Escape::Osc,
                (Escape::OscEsc, _) => Escape::None,
            };
        }
    }

    pub(super) fn take(&mut self, needle: &str) -> bool {
        match self.text[self.at..].find(needle) {
            Some(i) => {
                self.at += i + needle.len();
                true
            }
            None => false,
        }
    }

    pub(super) fn rest(&mut self) -> String {
        let rest = self.text[self.at..].to_owned();
        self.at = self.text.len();
        rest
    }

    pub(super) fn tail(&self) -> String {
        let text = &self.text[self.at..];
        let start = text.char_indices().rev().nth(200).map_or(0, |(i, _)| i);
        text[start..].to_owned()
    }
}
