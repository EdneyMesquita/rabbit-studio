// Debug builds only (lib.rs): RABBIT_STUDIO_SMOKE=<file> runs this in the
// real window, through the real IPC, and writes what it saw to <file>.
(async () => {
  const T = window.__TAURI_INTERNALS__;
  if ("__MODE__" === "startup") {
    // When the page was ready: navigation start to the app's first commit.
    const mark = performance.getEntriesByName("app-mounted")[0];
    const nav = performance.getEntriesByType("navigation")[0];
    await T.invoke("write_text_file", {
      path: "__OUT__",
      contents: JSON.stringify({ ok: true, appMountedMs: mark && Math.round(mark.startTime), domContentLoadedMs: nav && Math.round(nav.domContentLoadedEventEnd) }),
    });
    return;
  }
  if ("__MODE__" === "idle") {
    await T.invoke("write_text_file", { path: "__OUT__", contents: JSON.stringify({ ok: true, mode: "idle" }) });
    return;
  }
  if ("__MODE__" === "tour") {
    // Walks the mockup's screens, one at a time: writes <out>.<n> when a
    // screen is up, waits for <out>.go to say n (the capture is taken).
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const items = () => [...document.querySelectorAll("[role=treeitem]")];
    const label = (e) => e.textContent.trim();
    const tree = (text, { exact = true, within = null } = {}) => {
      const all = items().filter((e) => (exact ? label(e) === text : label(e).startsWith(text)));
      const el = within ? all.find((e) => e.compareDocumentPosition(within) & Node.DOCUMENT_POSITION_PRECEDING) : all[0];
      el?.click();
      return el;
    };
    const expand = (text) => {
      const el = items().find((e) => label(e).startsWith(text) && e.getAttribute("aria-expanded") === "false");
      el?.click();
    };
    const button = (text) => [...document.querySelectorAll("button")].find((b) => !b.closest(".invisible") && b.textContent.trim().startsWith(text))?.click();
    const key = (k, opts = {}) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...opts }));
    let n = 0;
    const shot = async (name) => {
      n++;
      await T.invoke("write_text_file", { path: `__OUT__.${n}`, contents: name });
      for (let i = 0; i < 120; i++) {
        await sleep(250);
        const go = await T.invoke("read_text_file", { path: "__OUT__.go" }).catch(() => "");
        if (go.trim() === String(n)) return;
      }
    };
    await sleep(1500);
    document.querySelector('button[aria-label^="Connect all"]')?.click();
    await sleep(4500);
    tree("All clusters", { exact: false });
    await sleep(4000);
    await shot("global");
    expand("Production");
    await sleep(600);
    expand("Dev cluster A");
    await sleep(800);
    tree("Overview");
    await sleep(4000);
    await shot("cluster");
    expand("orders");
    await sleep(1200);
    items().filter((e) => label(e).startsWith("Queues"))[0]?.querySelector("span,div")?.click();
    tree("Queues", { exact: false });
    await sleep(4000);
    await shot("queues");
    expand("Queues");
    await sleep(1500);
    tree("orders.created", { exact: false });
    await sleep(4000);
    await shot("queue");
    tree("orders.dlq", { exact: false });
    await sleep(4500);
    document.querySelector('tr[data-row="0"]')?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await sleep(1500);
    await shot("dlq");
    expand("Exchanges");
    await sleep(1500);
    tree("orders.events", { exact: false });
    await sleep(2500);
    button("Publish");
    await sleep(2500);
    await shot("publish");
    tree("Topology");
    await sleep(4500);
    await shot("topology");
    expand("Runtime");
    await sleep(600);
    tree("Connections", { exact: false });
    await sleep(4000);
    await shot("conns");
    expand("Admin");
    await sleep(600);
    tree("Virtual hosts");
    await sleep(3500);
    document.querySelector('tr[data-row="1"]')?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await sleep(1200);
    await shot("admin");
    key("n", { ctrlKey: true });
    await sleep(2000);
    await shot("newconn");
    const body = [...document.querySelectorAll("[role=dialog] *")].find((e) => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== "visible");
    if (body) body.scrollTop = body.scrollHeight;
    await sleep(600);
    await shot("newconn-password");
    [...document.querySelectorAll("[role=dialog] button")].find((b) => b.textContent.trim() === "OAuth 2")?.click();
    await sleep(600);
    if (body) body.scrollTop = body.scrollHeight;
    await sleep(600);
    await shot("newconn-oauth");
    key("Escape");
    await sleep(800);
    tree("orders.capped", { exact: false });
    await sleep(3500);
    button("Purge");
    await sleep(2000);
    await shot("purge");
    key("Escape");
    await sleep(600);
    tree("Policies");
    await sleep(3500);
    await shot("policies");
    const toggleTheme = () => document.querySelector('button[aria-label^="Switch to"]')?.click();
    toggleTheme();
    await sleep(800);
    tree("orders.dlq", { exact: false });
    await sleep(3000);
    document.querySelector('main tr[data-row="0"]')?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    await sleep(1200);
    await shot("dlq-light");
    tree("All clusters", { exact: false });
    await sleep(3500);
    await shot("global-light");
    toggleTheme();
    await sleep(500);
    await T.invoke("write_text_file", { path: "__OUT__", contents: JSON.stringify({ ok: true, shots: n }) });
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
