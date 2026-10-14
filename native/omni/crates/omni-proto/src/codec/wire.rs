//! Little-endian primitives of a frame body.

use crate::ProtoError;

#[derive(Default)]
pub(super) struct Writer(Vec<u8>);

impl Writer {
    pub(super) fn u8(&mut self, x: u8) -> &mut Self {
        self.0.push(x);
        self
    }
    pub(super) fn bool(&mut self, x: bool) -> &mut Self {
        self.u8(u8::from(x))
    }
    pub(super) fn u16(&mut self, x: u16) -> &mut Self {
        self.0.extend_from_slice(&x.to_le_bytes());
        self
    }
    pub(super) fn u32(&mut self, x: u32) -> &mut Self {
        self.0.extend_from_slice(&x.to_le_bytes());
        self
    }
    pub(super) fn i32(&mut self, x: i32) -> &mut Self {
        self.0.extend_from_slice(&x.to_le_bytes());
        self
    }
    pub(super) fn u64(&mut self, x: u64) -> &mut Self {
        self.0.extend_from_slice(&x.to_le_bytes());
        self
    }
    pub(super) fn bytes(&mut self, b: &[u8]) -> Result<&mut Self, ProtoError> {
        let n = u32::try_from(b.len()).map_err(|_| ProtoError(format!("field of {} bytes is too long", b.len())))?;
        self.u32(n);
        self.0.extend_from_slice(b);
        Ok(self)
    }
    pub(super) fn finish(self) -> Vec<u8> {
        self.0
    }
}

pub(super) struct Reader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    pub(super) fn new(buf: &'a [u8]) -> Self {
        Reader { buf, pos: 0 }
    }

    fn take<const N: usize>(&mut self) -> Result<[u8; N], ProtoError> {
        let b = self.slice(N)?;
        let mut out = [0u8; N];
        out.copy_from_slice(b);
        Ok(out)
    }

    fn slice(&mut self, n: usize) -> Result<&'a [u8], ProtoError> {
        let end = self.pos.checked_add(n).filter(|&e| e <= self.buf.len());
        let end = end.ok_or_else(|| ProtoError("frame ends inside a field".into()))?;
        let s = &self.buf[self.pos..end];
        self.pos = end;
        Ok(s)
    }

    pub(super) fn u8(&mut self) -> Result<u8, ProtoError> {
        Ok(self.take::<1>()?[0])
    }
    pub(super) fn bool(&mut self) -> Result<bool, ProtoError> {
        match self.u8()? {
            0 => Ok(false),
            1 => Ok(true),
            b => Err(ProtoError(format!("bad bool {b}"))),
        }
    }
    pub(super) fn u16(&mut self) -> Result<u16, ProtoError> {
        Ok(u16::from_le_bytes(self.take()?))
    }
    pub(super) fn u32(&mut self) -> Result<u32, ProtoError> {
        Ok(u32::from_le_bytes(self.take()?))
    }
    pub(super) fn i32(&mut self) -> Result<i32, ProtoError> {
        Ok(i32::from_le_bytes(self.take()?))
    }
    pub(super) fn u64(&mut self) -> Result<u64, ProtoError> {
        Ok(u64::from_le_bytes(self.take()?))
    }
    pub(super) fn bytes(&mut self) -> Result<Vec<u8>, ProtoError> {
        let n = self.u32()? as usize;
        Ok(self.slice(n)?.to_vec())
    }
    pub(super) fn string(&mut self) -> Result<String, ProtoError> {
        String::from_utf8(self.bytes()?).map_err(|_| ProtoError("text field is not UTF-8".into()))
    }
    /// A list count, refused when the remaining bytes cannot hold `count` items of at least `min_item` bytes.
    pub(super) fn count(&mut self, min_item: usize) -> Result<usize, ProtoError> {
        let n = self.u32()? as usize;
        let left = self.buf.len() - self.pos;
        if n.saturating_mul(min_item) > left {
            return Err(ProtoError(format!("list of {n} items cannot fit in {left} bytes")));
        }
        Ok(n)
    }
    pub(super) fn end(&self) -> Result<(), ProtoError> {
        if self.pos == self.buf.len() {
            Ok(())
        } else {
            Err(ProtoError(format!("{} trailing bytes", self.buf.len() - self.pos)))
        }
    }
}
