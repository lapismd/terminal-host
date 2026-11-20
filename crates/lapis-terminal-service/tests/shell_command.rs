use lapis_terminal_service::{PtyService, ShellCommand};
use std::{
    path::Path,
    time::{Duration, Instant},
};

fn collect(service: &PtyService, id: uuid::Uuid) -> (String, Option<i32>) {
    let deadline = Instant::now() + Duration::from_secs(8);
    let mut cursor = 0;
    let mut bytes = Vec::new();
    loop {
        let output = service
            .read(id, cursor, Duration::from_millis(100))
            .unwrap();
        cursor = output.cursor;
        bytes.extend(output.bytes);
        if !output.running {
            return (
                String::from_utf8_lossy(&bytes).into_owned(),
                output.exit_code,
            );
        }
        assert!(Instant::now() < deadline, "shell did not finish");
    }
}

#[test]
fn host_arguments_and_environment_reach_a_real_pty_without_interpolation() {
    let root = tempfile::tempdir().unwrap();
    let mut command = ShellCommand::login_interactive(Path::new("/bin/bash"));
    command.args = ["--noprofile", "--norc", "-ic", "test -t 0 && test -t 1 || exit 1; printf '%s\\n' \"$HOST_VALUE\"; printf '%s:%s:%s\\n' \"$TERM\" \"$COLORTERM\" \"$TERM_PROGRAM\"; exit 7"].map(Into::into).into();
    command.env.push((
        "HOST_VALUE".into(),
        "literal $(touch SHOULD_NOT_EXIST) `echo nope` spaces".into(),
    ));
    for name in ["TERM", "COLORTERM", "TERM_PROGRAM"] {
        command.env.push((name.into(), "wrong".into()));
    }
    let service = PtyService::with_command(root.path(), command).unwrap();
    let id = service.create(None, 80, 24).unwrap();
    let (output, code) = collect(&service, id);
    assert!(
        output.contains("literal $(touch SHOULD_NOT_EXIST) `echo nope` spaces\r\n"),
        "{output}"
    );
    assert!(
        output.contains("xterm-256color:truecolor:lapis-terminal"),
        "{output}"
    );
    assert!(!root.path().join("SHOULD_NOT_EXIST").exists());
    assert_eq!(code, Some(7));
}

#[test]
fn existing_constructor_retains_login_interactive_shell() {
    let root = tempfile::tempdir().unwrap();
    let service = PtyService::new(root.path(), Path::new("/bin/bash")).unwrap();
    let id = service.create(None, 80, 24).unwrap();
    service
        .write(
            id,
            b"shopt -q login_shell && [[ $- == *i* ]] && printf 'LOGIN_INTERACTIVE_OK\\n'; exit\n",
        )
        .unwrap();
    assert!(collect(&service, id).0.contains("LOGIN_INTERACTIVE_OK\r\n"));
}

#[test]
fn custom_command_still_requires_an_absolute_program() {
    let root = tempfile::tempdir().unwrap();
    assert!(
        PtyService::with_command(
            root.path(),
            ShellCommand::login_interactive(Path::new("bash"))
        )
        .is_err()
    );
}
