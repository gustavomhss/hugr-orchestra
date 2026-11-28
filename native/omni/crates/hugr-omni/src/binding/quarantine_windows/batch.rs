use super::{
    IoStatus, NtSetInformationFile, Owned, acquire_root, identity, open_with_share, parents, parse,
    require_regular_single_link, status,
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
            require_regular_single_link(source.0)?;
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
