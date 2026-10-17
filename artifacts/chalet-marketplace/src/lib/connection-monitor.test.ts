import assert from "node:assert/strict";
import { test } from "node:test";
import { ConnectionMonitor } from "./connection-monitor";

const API = "https://example.invalid/market/api";
test("tracks prefixed API requests and returns the original response untouched", async () => {
  let finish!: (response: Response) => void;
  const monitor = new ConnectionMonitor(() => new Promise(resolve => { finish = resolve; }), API, () => 100);
  const pending = monitor.fetch(`${API}/cities`);
  assert.equal(monitor.getSnapshot().oldestRequest, 100);
  const response = new Response('{"cities":[]}');
  finish(response);
  assert.equal(await pending, response);
  assert.equal(monitor.getSnapshot().oldestRequest, null);
  assert.equal(await response.text(), '{"cities":[]}');
});
test("external uploads, storage and health checks are not treated as foreground loads", async () => {
  const monitor = new ConnectionMonitor(async () => new Response(), API);
  for (const path of ["https://uploads.invalid/file", `${API}/storage/file`, `${API}/healthz`]) {
    const pending = monitor.fetch(path);
    assert.equal(monitor.getSnapshot().oldestRequest, null);
    await pending;
  }
});
test("HTTP authorization and server errors are not mistaken for offline failures", async () => {
  for (const status of [401, 403, 404, 500]) {
    const monitor = new ConnectionMonitor(async () => new Response(null, { status }), API);
    assert.equal((await monitor.fetch(`${API}/owner/profile`)).status, status);
    assert.equal(monitor.getSnapshot().poor, false);
  }
});
test("slow customer-note autosaves do not block the editor or hide unrelated foreground reads", async () => {
  for (const endpoint of ["customers", "service-clients"]) {
    const finish: Array<() => void> = [];
    const monitor = new ConnectionMonitor(() => new Promise(resolve => {
      finish.push(() => resolve(new Response()));
    }), API, () => 100);
    const save = monitor.fetch(`${API}/owner/${endpoint}/0501234567/note?providerId=12`, { method: "PUT", body: '{"notes":"draft"}' });
    assert.equal(monitor.getSnapshot().oldestRequest, null);
    const read = monitor.fetch(`${API}/owner/profile`);
    assert.equal(monitor.getSnapshot().oldestRequest, 100);
    finish[0]();
    await save;
    assert.equal(monitor.getSnapshot().oldestRequest, 100);
    finish[1]();
    await read;
    assert.equal(monitor.getSnapshot().oldestRequest, null);
  }
});
test("background note failures still report poor connectivity and are never replayed", async () => {
  let writes = 0;
  const monitor = new ConnectionMonitor(async input => {
    if (String(input).endsWith("/healthz")) return new Response();
    ++writes;
    throw new TypeError("Offline");
  }, API);
  await assert.rejects(monitor.fetch(`${API}/owner/customers/0501234567/note`, { method: "PUT", body: '{"notes":"draft"}' }));
  assert.equal(monitor.getSnapshot().oldestRequest, null);
  assert.equal(monitor.getSnapshot().poor, true);
  await monitor.probe();
  assert.equal(monitor.getSnapshot().poor, false);
  assert.equal(writes, 1);
});
test("failed saves are never replayed and their options remain unchanged", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const failure = new TypeError("Failed to fetch");
  const monitor = new ConnectionMonitor(async (input, init) => {
    calls.push({ input, init });
    if (String(input).endsWith("/healthz")) return new Response();
    throw failure;
  }, API);
  const options = { method: "POST", body: '{"amount":100}', credentials: "include" as const };
  await assert.rejects(monitor.fetch(`${API}/payments`, options), error => error === failure);
  assert.equal(monitor.getSnapshot().poor, true);
  await monitor.probe();
  assert.equal(monitor.getSnapshot().poor, false);
  assert.equal(monitor.getSnapshot().recovered, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init, options);
  assert.match(String(calls[1].input), /\/healthz$/);
});
test("cancelled requests do not trigger a connection warning", async () => {
  const signal = AbortSignal.abort();
  const monitor = new ConnectionMonitor(async () => { throw new DOMException("Cancelled", "AbortError"); }, API);
  await assert.rejects(monitor.fetch(`${API}/cities`, { signal }));
  assert.equal(monitor.getSnapshot().poor, false);
});
test("online events require a successful health probe before confirming recovery", async () => {
  let reachable = false;
  const monitor = new ConnectionMonitor(async () => {
    if (!reachable) throw new TypeError("Offline");
    return new Response();
  }, API);
  monitor.setOnline(false);
  await monitor.probe();
  assert.equal(monitor.getSnapshot().online, false);
  monitor.setOnline(true);
  await monitor.probe();
  assert.equal(monitor.getSnapshot().poor, true);
  reachable = true;
  await monitor.probe();
  assert.equal(monitor.getSnapshot().poor, false);
  assert.equal(monitor.getSnapshot().recovered, 1);
});
test("slow health responses indicate poor connectivity and fast probes restore it", async () => {
  let clock = 0, latency = 3000;
  const monitor = new ConnectionMonitor(async () => { clock += latency; return new Response(); }, API, () => clock);
  await monitor.probe();
  assert.equal(monitor.getSnapshot().poor, true);
  latency = 50;
  await monitor.probe();
  assert.equal(monitor.getSnapshot().poor, false);
});
test("failed data reads resume once after confirmed recovery", async () => {
  let reads = 0;
  const monitor = new ConnectionMonitor(async input => {
    if (String(input).endsWith("/healthz")) return new Response();
    if (++reads === 1) throw new TypeError("Offline");
    return new Response('{"ok":true}');
  }, API);
  const pending = monitor.fetch(`${API}/cities`);
  await Promise.resolve();
  assert.equal(reads, 1);
  assert.equal(monitor.getSnapshot().poor, true);
  await monitor.probe();
  assert.equal((await pending).status, 200);
  assert.equal(reads, 2);
});
test("authentication GET actions are never retried", async () => {
  let calls = 0;
  const monitor = new ConnectionMonitor(async () => { ++calls; throw new TypeError("Offline"); }, API);
  await assert.rejects(monitor.fetch(`${API}/auth/logout`));
  assert.equal(calls, 1);
});
test("reading the current session waits for recovery instead of appearing logged out", async () => {
  let online = false;
  const monitor = new ConnectionMonitor(async () => {
    if (!online) throw new TypeError("Offline");
    return new Response('{"id":"existing-owner"}');
  }, API);
  const pending = monitor.fetch(`${API}/auth/user`);
  await Promise.resolve();
  assert.equal(monitor.getSnapshot().poor, true);
  online = true;
  await monitor.probe();
  assert.equal(await (await pending).text(), '{"id":"existing-owner"}');
});
test("a cancelled recovery wait does not send another request", async () => {
  let calls = 0;
  const controller = new AbortController();
  const monitor = new ConnectionMonitor(async () => { ++calls; throw new TypeError("Offline"); }, API);
  const pending = monitor.fetch(`${API}/cities`, { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, error => error instanceof Error && error.name === "AbortError");
  assert.equal(calls, 1);
});
