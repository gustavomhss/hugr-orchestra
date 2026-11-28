//! Root-admin executable allowlist for the socket-activated isolated supervisor.

use std::ffi::{CStr, OsStr};
use std::io;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::MetadataExt;
use std::path::{Component, Path, PathBuf};

use omni_proto::FailCode;

use super::spawn::Fail;

pub(super) struct ExecutablePolicy {
    programs: Vec<Vec<u8>>,
}

impl ExecutablePolicy {
    pub(super) fn load() -> io::Result<Self> {
        let invalid = || io::Error::other("invalid isolated executable provisioning");
        let configured = std::env::var_os("HUGR_OMNI_ISOLATION_EXECUTABLES").ok_or_else(invalid)?;
        let entries: Vec<&[u8]> = configured.as_bytes().split(|b| *b == b':').collect();
        if entries.is_empty() || entries.len() > 32 || entries.iter().any(|entry| entry.is_empty()) {
            return Err(invalid());
        }
        let mut programs = Vec::with_capacity(entries.len());
        for entry in entries {
            let path = Path::new(OsStr::from_bytes(entry));
            if entry == b"/" || !path.is_absolute() || std::fs::canonicalize(path)?.as_os_str().as_bytes() != entry {
                return Err(invalid());
            }
            let mut current = PathBuf::from("/");
            validate(&current, false)?;
            for part in path.components() {
                match part {
                    Component::RootDir => (),
                    Component::Normal(name) => {
                        current.push(name);
                        validate(&current, current.as_os_str().as_bytes() == entry)?;
                    }
                    _ => return Err(invalid()),
                }
            }
            programs.push(entry.to_vec());
        }
        Ok(Self { programs })
    }

    pub(super) fn admit(&self, program: &CStr) -> Result<(), Fail> {
        if self.programs.iter().any(|allowed| allowed.as_slice() == program.to_bytes()) {
            return Ok(());
        }
        Err(Fail::new(FailCode::Invalid, 0, "executable is not authorized".into()))
    }
}

fn validate(path: &Path, executable: bool) -> io::Result<()> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.uid() != 0
        || metadata.mode() & 0o022 != 0
        || if executable {
            !metadata.is_file() || metadata.mode() & 0o111 == 0
        } else {
            !metadata.is_dir()
        }
    {
        return Err(io::Error::other("unprotected isolated executable path"));
    }
    Ok(())
}
