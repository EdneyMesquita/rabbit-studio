// Debug builds only (lib.rs): RABBIT_STUDIO_SMOKE=<file> runs this in the
// real window, through the real IPC, and writes what it saw to <file>.
(async () => {
  const T = window.__TAURI_INTERNALS__;
  const out = { steps: [] };
  const step = (name, value) => out.steps.push({ name, value });
  try {
    const profiles = await T.invoke("list_connection_profiles");
    const a = profiles.find((p) => p.name === "Dev cluster A");
    const h = await T.invoke("connect", { id: a.id });
    step("connect", { version: h.serverVersion, amqp: h.amqp });
    const raw = await T.invoke("mgmt", { sessionId: h.sessionId, methodName: "GET", path: "queues/orders?columns=name,messages", body: null });
    step("mgmt type", Object.prototype.toString.call(raw));
    const list = JSON.parse(new TextDecoder().decode(raw));
    step("mgmt parsed", { queues: list.length, first: list[0] && list[0].name });
    const progress = [];
    const handler = T.transformCallback((e) => progress.push(e.payload));
    await T.invoke("plugin:event|listen", { event: "transfer-progress", target: { kind: "Any" }, handler });
    const msgs = await T.invoke("get_messages", { sessionId: h.sessionId, vhost: "orders", queue: "orders.dlq", count: 1, requeue: true, truncate: null });
    step("peek", { count: msgs.length, fingerprint: msgs[0] && msgs[0].fingerprint });
    const summary = await T.invoke("transfer_messages", {
      sessionId: h.sessionId, executionId: "smoke",
      input: { vhost: "orders", queue: "orders.dlq", target: { kind: "origin" }, select: [msgs[0].fingerprint], limit: null },
    });
    await new Promise((r) => setTimeout(r, 300));
    step("transfer", { summary, progressEvents: progress.length, last: progress[progress.length - 1] });
    await T.invoke("disconnect", { sessionId: h.sessionId });
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = String(e && e.message ? e.message : e);
  }
  await T.invoke("write_text_file", { path: "__OUT__", contents: JSON.stringify(out, null, 2) });
})();
