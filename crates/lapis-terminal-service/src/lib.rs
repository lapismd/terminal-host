//! Deno-free PTY ownership. Authentication and vault admission belong to hosts.
mod output;
mod session;
pub use output::Output;
use session::Session;
use std::os::unix::fs::MetadataExt;
use std::{
    collections::HashMap,
    io,
    path::{Component, Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use uuid::Uuid;

const MAX_SESSIONS: usize = 8;
fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
pub struct PtyService {
    root: PathBuf,
    identity: (u64, u64),
    shell: PathBuf,
    sessions: Mutex<HashMap<Uuid, Arc<Session>>>,
    closed: AtomicBool,
}
impl PtyService {
    pub fn new(root: &Path, shell: &Path) -> io::Result<Self> {
        if !root.is_absolute() || !shell.is_absolute() {
            return Err(invalid("Terminal host paths must be absolute"));
        }
        let root = root.canonicalize()?;
        let metadata = root.symlink_metadata()?;
        if !metadata.is_dir() {
            return Err(invalid("Terminal root must be a directory"));
        }
        Ok(Self {
            root,
            identity: (metadata.dev(), metadata.ino()),
            shell: shell.into(),
            sessions: Mutex::new(HashMap::new()),
            closed: AtomicBool::new(false),
        })
    }
    pub fn create(&self, cwd: Option<&str>, cols: u16, rows: u16) -> io::Result<Uuid> {
        let cwd = self.resolve_cwd(cwd)?;
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| io::Error::other("Terminal unavailable"))?;
        if self.closed.load(Ordering::Acquire) {
            return Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "Terminal host is closed",
            ));
        }
        if sessions.len() >= MAX_SESSIONS {
            return Err(io::Error::new(
                io::ErrorKind::WouldBlock,
                "Terminal session limit reached",
            ));
        }
        let session = Arc::new(Session::spawn(&cwd, &self.shell, cols, rows)?);
        let id = Uuid::new_v4();
        sessions.insert(id, session);
        Ok(id)
    }
    fn session(&self, id: Uuid) -> io::Result<Arc<Session>> {
        self.sessions
            .lock()
            .map_err(|_| io::Error::other("Terminal unavailable"))?
            .get(&id)
            .cloned()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Terminal unavailable"))
    }
    pub fn write(&self, id: Uuid, bytes: &[u8]) -> io::Result<()> {
        self.session(id)?.write(bytes)
    }
    pub fn resize(&self, id: Uuid, cols: u16, rows: u16) -> io::Result<()> {
        self.session(id)?.resize(cols, rows)
    }
    pub fn read(&self, id: Uuid, cursor: u64, timeout: Duration) -> io::Result<Output> {
        self.session(id)?.output.read(cursor, timeout)
    }
    pub fn stop(&self, id: Uuid) -> io::Result<()> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| io::Error::other("Terminal unavailable"))?
            .remove(&id)
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Terminal unavailable"))?;
        session.stop()
    }
    pub fn close(&self) -> io::Result<()> {
        let mut registry = self
            .sessions
            .lock()
            .map_err(|_| io::Error::other("Terminal unavailable"))?;
        self.closed.store(true, Ordering::Release);
        let sessions: Vec<_> = registry.drain().map(|(_, value)| value).collect();
        drop(registry);
        let mut failure = None;
        for session in sessions {
            if let Err(error) = session.stop() {
                failure.get_or_insert(error);
            }
        }
        failure.map_or(Ok(()), Err)
    }
    fn resolve_cwd(&self, requested: Option<&str>) -> io::Result<PathBuf> {
        let metadata = self.root.symlink_metadata()?;
        if !metadata.is_dir() || (metadata.dev(), metadata.ino()) != self.identity {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "Terminal root changed",
            ));
        }
        let requested = requested.unwrap_or("");
        if requested.len() > 4096 || requested.contains(['\\', '\0']) {
            return Err(invalid("Invalid terminal cwd"));
        }
        let mut path = self.root.clone();
        for part in Path::new(requested).components() {
            match part {
                Component::Normal(name) => path.push(name),
                Component::CurDir => continue,
                _ => return Err(invalid("Terminal cwd must remain relative to its root")),
            }
            let metadata = path.symlink_metadata()?;
            if !metadata.is_dir() || metadata.file_type().is_symlink() {
                return Err(invalid("Invalid terminal cwd"));
            }
        }
        Ok(path)
    }
}
impl Drop for PtyService {
    fn drop(&mut self) {
        let _ = self.close();
    }
}
