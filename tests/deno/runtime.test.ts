import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { createTerminalRuntimeBridge } from "../../src/client.ts";
import { createDenoTerminalSessionService } from "../../src/deno.ts";
import { verifyPtyLibrary } from "../../src/native-library.ts";
import type { PtyLike } from "../../src/pty-session.ts";
import { createTerminalSessionService } from "../../src/session-service.ts";
import { startTerminalRuntimeServer } from "../../src/ws-server.ts";

Deno.test("Deno websocket host preserves protocol and rejects a bad token", async () => {
  const sessions = createTerminalSessionService({
    workspace: Deno.cwd(),
    env: Deno.env.toObject(),
    platform: Deno.build.os === "darwin" ? "darwin" : "linux",
    spawn: (request): PtyLike => ({
      pid: null,
      write(data) {
        const text = typeof data === "string" ? data : new TextDecoder().decode(data);
        request.onData?.(new TextEncoder().encode(`out:${text}`));
      },
      resize() {},
      pause() {},
      resume() {},
      stop() { request.onExit?.({ exitCode: null }); },
    }),
  });
  const server = await startTerminalRuntimeServer({
    port: 0,
    bind: "127.0.0.1",
    token: "deno-test-token",
    workspace: Deno.cwd(),
    sessions,
  });
  try {
    const bad = createTerminalRuntimeBridge({ url: `ws://127.0.0.1:${server.port}`, token: "bad" });
    await assertRejects(() => bad.invoke("terminal_session_list"));
    bad.dispose();

    const bridge = createTerminalRuntimeBridge({
      url: `ws://127.0.0.1:${server.port}`,
      token: "deno-test-token",
    });
    const output: string[] = [];
    const exits: Array<number | null> = [];
    bridge.onTerminalOutput?.((event) => output.push(atob(event.data)));
    bridge.onTerminalExit?.((event) => exits.push(event.code));
    const created = await bridge.invoke<{ sessionId: string }>("terminal_session_create", { cols: 80, rows: 24 });
    await bridge.invoke("terminal_session_resize", { sessionId: created.sessionId, cols: 100, rows: 30 });
    const listed = await bridge.invoke<Array<{ sessionId: string; cols: number; rows: number }>>(
      "terminal_session_list",
    );
    assertEquals(listed, [{ ...created, cols: 100, rows: 30 }]);
    await bridge.invoke("terminal_session_write", {
      sessionId: created.sessionId,
      data: btoa("hello"),
    });
    await waitFor(() => output.join("").includes("out:hello"));
    assertEquals(output.join(""), "out:hello");
    await bridge.invoke("terminal_session_stop", { sessionId: created.sessionId });
    await waitFor(() => exits.length > 0);
    assertEquals(exits, [null]);
    bridge.dispose();
  } finally {
    sessions.close();
    await server.close();
  }
});

Deno.test("Deno websocket client restores spawn output once before live I/O", async () => {
  const sessions = createTerminalSessionService({
    workspace: Deno.cwd(),
    env: Deno.env.toObject(),
    platform: Deno.build.os === "darwin" ? "darwin" : "linux",
    spawn: (request): PtyLike => {
      request.onData?.(new TextEncoder().encode("PROMPT"));
      return { pid: null, write() {}, resize() {}, pause() {}, resume() {}, stop() {} };
    },
  });
  const server = await startTerminalRuntimeServer({
    port: 0,
    bind: "127.0.0.1",
    token: "restore-token",
    workspace: Deno.cwd(),
    sessions,
  });
  try {
    const bridge = createTerminalRuntimeBridge({
      url: `ws://127.0.0.1:${server.port}`,
      token: "restore-token",
    });
    const output: string[] = [];
    bridge.onTerminalOutput?.((event) => output.push(atob(event.data)));
    await bridge.invoke("terminal_session_create");
    await waitFor(() => output.length > 0);
    assertEquals(output, ["PROMPT"]);
    bridge.dispose();
  } finally {
    sessions.close();
    await server.close();
  }
});

Deno.test("PTY native artifact verification rejects a checksum mismatch", async () => {
  const path = await Deno.makeTempFile({ prefix: "lapis-pty-checksum-" });
  try {
    await Deno.writeTextFile(path, "not-the-release-library");
    await assertRejects(
      () => verifyPtyLibrary(path, "0".repeat(64)),
      Error,
      "checksum mismatch",
    );
  } finally {
    await Deno.remove(path);
  }
});

Deno.test("sigma PTY writes, resizes, returns raw output, and exits", async () => {
  const workspace = await Deno.makeTempDir({ prefix: "lapis-terminal-host-" });
  const sessions = await createDenoTerminalSessionService({ workspace });
  try {
    const created = sessions.create({
      shell: Deno.build.os === "darwin" ? "/bin/zsh" : "/bin/bash",
      cols: 80,
      rows: 24,
    });
    const chunks: Uint8Array[] = [];
    const exits: Array<number | null> = [];
    sessions.attach(created.sessionId, {
      onOutput: (chunk) => chunks.push(chunk),
      onExit: (code) => exits.push(code),
    });
    assert(sessions.resize(created.sessionId, 100, 30));
    sessions.write(created.sessionId, "printf 'LAPIS_PTY_OK:%s\\n' \"$((6*7))\"\nstty size\nexit 7\n");
    await waitFor(() => exits.length > 0, 5_000);
    const output = new TextDecoder().decode(concat(chunks));
    assertStringIncludes(output, "LAPIS_PTY_OK:42");
    assertStringIncludes(output, "30 100");
    assertEquals(exits, [7]);
  } finally {
    sessions.close();
    await Deno.remove(workspace, { recursive: true });
  }
});

function concat(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function waitFor(predicate: () => boolean, timeout = 2_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
