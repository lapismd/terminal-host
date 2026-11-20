use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

/// Immutable launch policy supplied by the native host, never a terminal client.
#[derive(Clone, Debug)]
pub struct ShellCommand {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub env: Vec<(OsString, OsString)>,
}

impl ShellCommand {
    /// Preserve the service's original login-interactive launch defaults.
    pub fn login_interactive(program: &Path) -> Self {
        Self {
            program: program.into(),
            args: vec!["-il".into()],
            env: Vec::new(),
        }
    }
}
