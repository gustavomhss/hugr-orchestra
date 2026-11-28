use super::{
    IoStatus, NtSetInformationFile, Owned, acquire_root, identity, open_with_share, parents, parse, query, status,
};

struct ReservedFile {
    source: Owned,
    _ancestors: Vec<Owned>,
    _root: Owned,
}

/// Reserves every trusted host path before disposing any of them. Directories are refused.
pub fn dispose_batch(items: &[(String, String)]) -> &'static str {
    fn reserve(items: &[(String, String)]) -> Result<Vec<ReservedFile>, String> {
        if items.is_empty() || items.len() > 16 {
            return Err("batch size outside 1 to 16".into());
        }
        let mut identities = std::collections::HashSet::new();
        let mut reserved = Vec::new();
        for (path, expected) in items {
            if !identities.insert(expected) {
                return Err("duplicate identity".into());
            }
            let (drive, parts) = parse(path)?;
            let root = acquire_root(&drive, 0)?;
            let ancestors = parents(&root, &parts[..parts.len() - 1], 0)?;
            let parent = ancestors.last().map_or(root.0, |h| h.0);
            let source =
                open_with_share(parent, &parts[parts.len() - 1], false, true, false, 0, 0)?.ok_or("missing source")?;
            if identity(source.0)? != *expected {
                return Err("source identity changed".into());
            }
            let mut attributes = [0u8; 8];
            query(source.0, 35, &mut attributes)?;
            let flags = u32::from_le_bytes(attributes[..4].try_into().map_err(|_| "invalid attribute data")?);
            if flags & (0x01 | 0x10 | 0x40 | 0x400) != 0 {
                return Err("read-only file, directory, device or reparse point".into());
            }
            // FILE_STANDARD_INFORMATION: NumberOfLinks is a ULONG at offset 16.
            let mut standard = [0u8; 24];
            query(source.0, 5, &mut standard)?;
            if u32::from_le_bytes(standard[16..20].try_into().map_err(|_| "invalid link count data")?) != 1 {
                return Err("hard links are not supported".into());
            }
            reserved.push(ReservedFile {
                source,
                _ancestors: ancestors,
                _root: root,
            });
        }
        Ok(reserved)
    }
    let Ok(reserved) = reserve(items) else {
        return "refused";
    };
    let disposition = 1u8;
    for item in &reserved {
        let mut io = IoStatus {
            status: 0,
            information: 0,
        };
        // SAFETY: the admission retains every handle and the synchronous buffer is live.
        if status(unsafe { NtSetInformationFile(item.source.0, &mut io, (&disposition as *const u8).cast(), 1, 13) })
            .is_err()
        {
            return "unknown";
        }
    }
    "accepted"
}
