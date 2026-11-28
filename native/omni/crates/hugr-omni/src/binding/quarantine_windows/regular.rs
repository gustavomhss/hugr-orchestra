use super::{Handle, query};

pub(super) fn require_regular_single_link(handle: Handle) -> Result<(), String> {
    let mut attributes = [0u8; 8];
    query(handle, 35, &mut attributes)?;
    let flags = u32::from_le_bytes(attributes[..4].try_into().map_err(|_| "invalid attribute data")?);
    if flags & (0x01 | 0x10 | 0x40 | 0x400) != 0 {
        return Err("read-only file, directory, device or reparse point".into());
    }
    let mut standard = [0u8; 24];
    query(handle, 5, &mut standard)?;
    if u32::from_le_bytes(standard[16..20].try_into().map_err(|_| "invalid link count data")?) != 1 {
        return Err("hard links are not supported".into());
    }
    Ok(())
}

