import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadFailure, uploadGuideFile } from "./guide-video-upload";

test("upload failures expose status and safe provider codes, never signed URLs or XML details", () => {
  assert.match(uploadFailure(413, "<html>proxy</html>").message, /HTTP 413.*حجم/);
  assert.match(uploadFailure(500, '{"code":"UPLOAD_STORAGE_NOT_WRITABLE","error":"التخزين غير قابل للكتابة"}', "req-7").message, /UPLOAD_STORAGE_NOT_WRITABLE.*req-7/);
  const xml = '<Error><Code>AccessDenied</Code><Message>https://storage.example/?secret=ticket</Message></Error>';
  assert.match(uploadFailure(403, xml).message, /AccessDenied/);
  assert.doesNotMatch(uploadFailure(403, xml).message, /secret|ticket|storage.example/);
  assert.doesNotMatch(uploadFailure(500, '{"error":"https://storage.example/?secret=hidden"}').message, /hidden/);
});

function fakeRequest() {
  const request = {
    status: 204, responseText: "", timeout: 0, upload: {} as any,
    onload: null as any, onerror: null as any, ontimeout: null as any, onabort: null as any,
    open: (...args: unknown[]) => { request.openArgs = args; },
    openArgs: [] as unknown[], headers: {} as Record<string,string>,
    setRequestHeader: (name: string, value: string) => { request.headers[name] = value; },
    getResponseHeader: () => "request-fixture",
    send: (body: unknown) => { request.body = body; }, body: undefined as unknown,
  };
  return request;
}

test("video uploads send original bytes by PUT with real progress and await server success", async () => {
  const xhr = fakeRequest();
  const file = new File(["original-video"], "guide.mp4", { type: "video/mp4" });
  const progress: number[] = [];
  const promise = uploadGuideFile("/signed-url", file, value => progress.push(value), () => xhr as unknown as XMLHttpRequest);
  assert.deepEqual(xhr.openArgs, ["PUT", "/signed-url"]);
  assert.equal(xhr.body, file);
  assert.equal(xhr.headers["Content-Type"], "video/mp4");
  assert.equal(xhr.timeout, 30 * 60_000);
  xhr.upload.onprogress({ lengthComputable: true, loaded: 28, total: 94 });
  xhr.upload.onprogress({ lengthComputable: false });
  xhr.onload();
  await promise;
  assert.deepEqual(progress, [0, 30, 100]);
});

test("storage rejection, timeout, network failure and cancellation reject without reporting success", async () => {
  for (const event of ["onload", "ontimeout", "onerror", "onabort"] as const) {
    const xhr = fakeRequest();
    xhr.status = 507;
    xhr.responseText = '{"code":"UPLOAD_STORAGE_FULL","error":"المساحة ممتلئة"}';
    const promise = uploadGuideFile("/signed-url", new File(["x"], "guide.mp4"), () => {}, () => xhr as unknown as XMLHttpRequest);
    const rejection = assert.rejects(promise, event === "onload" ? /HTTP 507.*UPLOAD_STORAGE_FULL/ : /UPLOAD_(TIMEOUT|NETWORK_ERROR|ABORTED)/);
    xhr[event]();
    await rejection;
  }
});
