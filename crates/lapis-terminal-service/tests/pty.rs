use lapis_terminal_service::PtyService;
use std::{
    path::Path,
    time::{Duration, Instant},
};

fn host(root: &Path) -> PtyService {
    PtyService::new(root, Path::new("/bin/bash")).unwrap()
}
fn collect(service: &PtyService, id: uuid::Uuid) -> (Vec<u8>, Option<i32>) {
    let deadline = Instant::now() + Duration::from_secs(8);
    let mut cursor = 0;
    let mut bytes = Vec::new();
    while Instant::now() < deadline {
        let frame = service
            .read(id, cursor, Duration::from_millis(100))
            .unwrap();
        cursor = frame.cursor;
        bytes.extend(frame.bytes);
        if !frame.running {
            return (bytes, frame.exit_code);
        }
    }
    panic!("terminal failed to finish");
}
#[test]
fn shell_has_real_pty_input_resize_and_drain() {
    let root = tempfile::tempdir().unwrap();
    let service = host(root.path());
    let id = service.create(None, 80, 24).unwrap();
    service.resize(id, 111, 33).unwrap();
    service.resize(id, 111, 33).unwrap();
    service
        .write(
            id,
            b"printf '\\x54\\x45\\x52\\x4d\\x5f\\x4f\\x4b\\n'; stty size; exit 7\n",
        )
        .unwrap();
    let (bytes, exit) = collect(&service, id);
    let text = String::from_utf8_lossy(&bytes);
    assert!(text.contains("TERM_OK\r\n"), "{text}");
    assert!(text.contains("33 111"), "{text}");
    assert_eq!(exit, Some(7));
    service.stop(id).unwrap();
}
#[test]
fn rejects_cwd_traversal_absolute_and_symlink_escapes() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();
    let service = host(root.path());
    for cwd in ["../", "/tmp", "escape", "a/../b", "bad\\path"] {
        assert!(service.create(Some(cwd), 80, 24).is_err(), "{cwd}");
    }
    assert!(service.create(None, 0, 24).is_err());
    assert!(service.create(None, 80, 501).is_err());
}
#[test]
fn replay_is_bounded_and_independent_for_two_readers() {
    let root = tempfile::tempdir().unwrap();
    let service = host(root.path());
    let id = service.create(None, 80, 24).unwrap();
    service
        .write(id, b"head -c 400000 /dev/zero | tr '\\0' x; exit\n")
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(8);
    // Peek from zero without consuming server replay; a second reader has its own cursor.
    let frame = loop {
        let frame = service.read(id, 0, Duration::from_millis(10)).unwrap();
        if frame.truncated {
            break frame;
        }
        assert!(Instant::now() < deadline, "replay did not exceed bound");
        std::thread::sleep(Duration::from_millis(10));
    };
    assert!(frame.bytes.len() <= 32 * 1024);
    let other = service.read(id, frame.cursor, Duration::ZERO).unwrap();
    assert!(other.cursor >= frame.cursor);
    service.stop(id).unwrap();
}
#[test]
fn close_reaps_shell_and_fences_new_sessions() {
    let root = tempfile::tempdir().unwrap();
    let service = host(root.path());
    let id = service.create(None, 80, 24).unwrap();
    service.write(id, b"sleep 30\n").unwrap();
    let start = Instant::now();
    service.close().unwrap();
    assert!(start.elapsed() < Duration::from_secs(5));
    assert!(service.read(id, 0, Duration::ZERO).is_err());
    assert!(service.create(None, 80, 24).is_err());
}
#[test]
fn rejects_replaced_root_and_bounds_session_count() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("vault");
    std::fs::create_dir(&path).unwrap();
    let service = host(&path);
    let mut ids = Vec::new();
    for _ in 0..8 {
        ids.push(service.create(None, 80, 24).unwrap());
    }
    assert!(service.create(None, 80, 24).is_err());
    for id in ids {
        service.stop(id).unwrap();
    }
    std::fs::rename(&path, root.path().join("old")).unwrap();
    std::fs::create_dir(&path).unwrap();
    assert!(service.create(None, 80, 24).is_err());
}
