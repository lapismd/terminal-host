use std::{
    collections::VecDeque,
    io,
    sync::{Condvar, Mutex},
    time::Duration,
};

pub const MAX_OUTPUT: usize = 256 * 1024;
pub const MAX_READ: usize = 32 * 1024;

#[derive(Clone, Debug)]
pub struct Output {
    pub cursor: u64,
    pub bytes: Vec<u8>,
    pub truncated: bool,
    pub running: bool,
    pub exit_code: Option<i32>,
}
#[derive(Default)]
struct State {
    base: u64,
    next: u64,
    bytes: VecDeque<u8>,
    exit_code: Option<i32>,
    reader_done: bool,
}
#[derive(Default)]
pub(crate) struct Replay {
    state: Mutex<State>,
    changed: Condvar,
}
impl Replay {
    pub fn append(&self, bytes: &[u8]) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.bytes.extend(bytes);
        state.next += bytes.len() as u64;
        let excess = state.bytes.len().saturating_sub(MAX_OUTPUT);
        state.bytes.drain(..excess);
        state.base += excess as u64;
        self.changed.notify_all();
    }
    pub fn exited(&self, code: i32) {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .exit_code = Some(code);
        self.changed.notify_all();
    }
    pub fn reader_done(&self) {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .reader_done = true;
        self.changed.notify_all();
    }
    pub fn complete(&self) -> bool {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        state.reader_done && state.exit_code.is_some()
    }
    pub fn wait_complete(&self, timeout: Duration) -> bool {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let (state, _) = self
            .changed
            .wait_timeout_while(state, timeout, |s| !s.reader_done || s.exit_code.is_none())
            .unwrap_or_else(|e| e.into_inner());
        state.reader_done && state.exit_code.is_some()
    }
    pub fn wait_exit(&self, timeout: Duration) -> bool {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let (state, _) = self
            .changed
            .wait_timeout_while(state, timeout, |s| s.exit_code.is_none())
            .unwrap_or_else(|e| e.into_inner());
        state.exit_code.is_some()
    }
    pub fn read(&self, cursor: u64, timeout: Duration) -> io::Result<Output> {
        let state = self
            .state
            .lock()
            .map_err(|_| io::Error::other("Terminal output unavailable"))?;
        if cursor > state.next {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Invalid terminal cursor",
            ));
        }
        let (state, _) = self
            .changed
            .wait_timeout_while(state, timeout, |s| {
                s.next == cursor && !(s.reader_done && s.exit_code.is_some())
            })
            .map_err(|_| io::Error::other("Terminal output unavailable"))?;
        let start = cursor.max(state.base);
        let bytes: Vec<_> = state
            .bytes
            .iter()
            .skip((start - state.base) as usize)
            .take(MAX_READ)
            .copied()
            .collect();
        Ok(Output {
            cursor: start + bytes.len() as u64,
            bytes,
            truncated: cursor < state.base,
            running: !(state.reader_done && state.exit_code.is_some()),
            exit_code: state.exit_code,
        })
    }
}
