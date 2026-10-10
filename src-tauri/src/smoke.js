// Debug builds only (lib.rs): RABBIT_STUDIO_SMOKE=<file> runs this in the
// real window, through the real IPC, and writes what it saw to <file>.
(async () => {
  const T = window.__TAURI_INTERNALS__;
  if ("__MODE__" === "idle") {
    await T.invoke("write_text_file", { path: "__OUT__", contents: JSON.stringify({ ok: true, mode: "idle" }) });
    return;
  }
  if ("__MODE__" === "load-nobeat") {
    const st = document.createElement("style");
    st.textContent = ".live-beat::after{animation:none!important}";
    document.head.appendChild(st);
  }
  if ("__MODE__".startsWith("load")) {
    // The app as a user leaves it: every cluster connected, the global view
    // open, the Explorer showing. Then measure the process from outside.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(1500);
    document.querySelector('button[aria-label^="Connect all"]')?.click();
    await sleep(4000);
    [...document.querySelectorAll("[role=treeitem]")].find((e) => e.textContent.includes("All clusters"))?.click();
    await sleep(3000);
    const connected = document.body.innerText.match(/\d+ of \d+ connected/)?.[0] ?? "?";
    // What changes on screen while nothing is touched: mutations by place.
    const where = {};
    let mutations = 0;
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        mutations++;
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        const owner = el && el.closest("[aria-label],[role]");
        const k = ((owner && (owner.getAttribute("aria-label") || owner.getAttribute("role"))) || (el && el.tagName) || "?").slice(0, 40);
        where[k] = (where[k] || 0) + 1;
      }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    // Frames asked for, and by whom.
    const raf = window.requestAnimationFrame.bind(window);
    const rafBy = {};
    let rafs = 0;
    window.requestAnimationFrame = (cb) => {
      rafs++;
      const site = (new Error().stack || "").split("\n").slice(1, 4).join(" < ").replace(/https?:\/\/[^/]+\//g, "").slice(0, 160);
      rafBy[site] = (rafBy[site] || 0) + 1;
      return raf(cb);
    };
    const timeouts = {};
    const st = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...rest) => {
      const k = String(ms);
      timeouts[k] = (timeouts[k] || 0) + 1;
      return st(fn, ms, ...rest);
    };
    await sleep(10000);
    window.requestAnimationFrame = raf;
    window.setTimeout = st;
    mo.disconnect();
    const animations = document.getAnimations().map((a) => a.animationName || a.constructor.name);
    const top = Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 12);
    await T.invoke("write_text_file", { path: "__OUT__", contents: JSON.stringify({ ok: true, connected, mutations10s: mutations, rafs10s: rafs, rafBy: Object.entries(rafBy).sort((a, b) => b[1] - a[1]).slice(0, 5), timeouts10s: timeouts, animations, top }, null, 1) });
    return;
  }
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
