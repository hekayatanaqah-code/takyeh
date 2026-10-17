import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CustomerNoteAutosave } from "./customerNoteAutosave";

describe("customer note autosave", () => {
  it("debounces typing and persists only the latest text", async () => {
    const writes: string[] = [];
    const writer = new CustomerNoteAutosave("", async text => { writes.push(text); }, 5);
    writer.change("ع");
    writer.change("عميل");
    writer.change("عميل مميز");
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.deepEqual(writes, ["عميل مميز"]);
    assert.equal(writer.status, "saved");
    assert.equal(writer.dirty, false);
  });
  it("serializes edits during an in-flight request and flush waits for the latest draft", async () => {
    const writes: string[] = [];
    let complete!: () => void;
    const writer = new CustomerNoteAutosave("", async text => {
      writes.push(text);
      if (writes.length === 1) await new Promise<void>(resolve => { complete = resolve; });
    });
    writer.change("قبل");
    const firstFlush = writer.flush();
    writer.change("بعد");
    const secondFlush = writer.flush();
    assert.deepEqual(writes, ["قبل"]);
    complete();
    await Promise.all([firstFlush, secondFlush]);
    assert.deepEqual(writes, ["قبل", "بعد"]);
    assert.equal(writer.dirty, false);
  });
  it("keeps the draft on error without reporting success and permits an explicit retry", async () => {
    let fails = true;
    const writes: string[] = [];
    const writer = new CustomerNoteAutosave("أصل", async text => {
      if (fails) throw new Error("Network error");
      writes.push(text);
    });
    writer.change("نص جديد");
    await assert.rejects(writer.flush());
    assert.equal(writer.status, "error");
    assert.equal(writer.value, "نص جديد");
    assert.equal(writer.dirty, true);
    fails = false;
    await writer.flush();
    assert.deepEqual(writes, ["نص جديد"]);
    assert.equal(writer.status, "saved");
  });
  it("persists clearing a note as an empty string, not an omitted value", async () => {
    const writes: string[] = [];
    const writer = new CustomerNoteAutosave("ملاحظة سابقة", async text => { writes.push(text); });
    writer.change("");
    await writer.flush();
    assert.deepEqual(writes, [""]);
    assert.equal(writer.dirty, false);
  });
  it("does not write untouched notes or a draft reverted before saving", async () => {
    const writes: string[] = [];
    const writer = new CustomerNoteAutosave("الأصل", async text => { writes.push(text); });
    await writer.flush();
    writer.change("تعديل");
    writer.change("الأصل");
    await writer.flush();
    assert.deepEqual(writes, []);
  });
  it("finishes an in-flight change before restoring a draft to its original value", async () => {
    const writes: string[] = [];
    let complete!: () => void;
    const writer = new CustomerNoteAutosave("الأصل", async text => {
      writes.push(text);
      if (writes.length === 1) await new Promise<void>(resolve => { complete = resolve; });
    });
    writer.change("تعديل");
    const flush = writer.flush();
    writer.change("الأصل");
    complete();
    await flush;
    assert.deepEqual(writes, ["تعديل", "الأصل"]);
    assert.equal(writer.status, "saved");
  });
  it("does not mix two customers' drafts or save destinations", async () => {
    const writes: [string, string][] = [];
    const first = new CustomerNoteAutosave("", async text => { writes.push(["first", text]); });
    const second = new CustomerNoteAutosave("", async text => { writes.push(["second", text]); });
    first.change("العميل الأول");
    second.change("العميل الثاني");
    await Promise.all([first.flush(), second.flush()]);
    assert.deepEqual(writes, [["first", "العميل الأول"], ["second", "العميل الثاني"]]);
  });
});
