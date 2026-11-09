use crate::{invalid, output::Replay};
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use std::{
    io::{self, Read, Write},
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};

pub(crate) struct Session {
    pub output: Arc<Replay>,
    io: Mutex<Io>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    pid: Option<u32>,
}
struct Io {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    cols: u16,
    rows: u16,
}
pub(crate) fn size(cols: u16, rows: u16) -> io::Result<PtySize> {
    if cols == 0 || rows == 0 || cols > 500 || rows > 500 {
        return Err(invalid("Invalid terminal size"));
    }
    Ok(PtySize {
        cols,
        rows,
        pixel_width: 0,
        pixel_height: 0,
    })
}
impl Session {
    pub fn spawn(cwd: &Path, shell: &Path, cols: u16, rows: u16) -> io::Result<Self> {
        let pair = native_pty_system()
            .openpty(size(cols, rows)?)
            .map_err(io::Error::other)?;
        let mut command = CommandBuilder::new(shell);
        command.arg("-il");
        command.cwd(cwd);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("TERM_PROGRAM", "lapis-terminal");
        let mut reader = pair.master.try_clone_reader().map_err(io::Error::other)?;
        let writer = pair.master.take_writer().map_err(io::Error::other)?;
        let mut child = pair
            .slave
            .spawn_command(command)
            .map_err(io::Error::other)?;
        drop(pair.slave);
        let pid = child.process_id();
        let killer = child.clone_killer();
        let output = Arc::new(Replay::default());
        let read_output = output.clone();
        // Named, fallible thread creation: a failed reader must not strand a shell.
        let read_thread = std::thread::Builder::new()
            .name("lapis-terminal-output".into())
            .spawn(move || {
                let mut buffer = [0; 8192];
                loop {
                    match reader.read(&mut buffer) {
                        Err(ref error) if error.kind() == io::ErrorKind::Interrupted => continue,
                        Ok(0) | Err(_) => break,
                        Ok(count) => read_output.append(&buffer[..count]),
                    }
                }
                read_output.reader_done();
            });
        if let Err(error) = read_thread {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        let exited = output.clone();
        let child = Arc::new(Mutex::new(child));
        let wait_child = child.clone();
        let waiter = std::thread::Builder::new()
            .name("lapis-terminal-exit".into())
            .spawn(move || {
                let mut child = wait_child.lock().unwrap_or_else(|e| e.into_inner());
                exited.exited(child.wait().map_or(-1, |status| status.exit_code() as i32));
            });
        if let Err(error) = waiter {
            if let Some(pid) = pid {
                terminate_group(pid, libc::SIGKILL);
            }
            let mut child = child.lock().unwrap_or_else(|e| e.into_inner());
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        Ok(Self {
            output,
            io: Mutex::new(Io {
                master: pair.master,
                writer,
                cols,
                rows,
            }),
            killer: Mutex::new(killer),
            pid,
        })
    }
    pub fn write(&self, bytes: &[u8]) -> io::Result<()> {
        if bytes.len() > 64 * 1024 {
            return Err(invalid("Terminal input exceeds limit"));
        }
        let mut io = self
            .io
            .lock()
            .map_err(|_| io::Error::other("Terminal unavailable"))?;
        io.writer.write_all(bytes)?;
        io.writer.flush()
    }
    pub fn resize(&self, cols: u16, rows: u16) -> io::Result<()> {
        let size = size(cols, rows)?;
        let mut io = self
            .io
            .lock()
            .map_err(|_| io::Error::other("Terminal unavailable"))?;
        if io.cols == cols && io.rows == rows {
            return Ok(());
        }
        io.master.resize(size).map_err(io::Error::other)?;
        io.cols = cols;
        io.rows = rows;
        Ok(())
    }
    pub fn stop(&self) -> io::Result<()> {
        if self.output.complete() {
            return Ok(());
        }
        // The PTY child is a session leader. Terminate its process group, including
        // ordinary shell descendants, before reaping the leader.
        if let Some(pid) = self.pid {
            terminate_group(pid, libc::SIGTERM);
        }
        let _ = self.killer.lock().unwrap_or_else(|e| e.into_inner()).kill();
        if !self.output.wait_exit(Duration::from_millis(250)) {
            if let Some(pid) = self.pid {
                terminate_group(pid, libc::SIGKILL);
            }
            if !self.output.wait_exit(Duration::from_secs(3)) {
                return Err(io::Error::other("Terminal did not stop"));
            }
        }
        if !self.output.wait_complete(Duration::from_secs(3)) {
            return Err(io::Error::other("Terminal output did not drain"));
        }
        Ok(())
    }
}
fn terminate_group(pid: u32, signal: i32) {
    // SAFETY: a positive child PID is the PTY-created Unix process-group ID.
    unsafe {
        libc::killpg(pid as i32, signal);
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}
