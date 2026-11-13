"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { isTaqnyatAccepted } = require("./taqnyatWhatsApp.js");

const accepted = {
    type: "whatsapp",
    statuses: [{ message_id: "wamid.test-fixture", recipient: "+966500000000" }]
};

test("accepts documented WhatsApp v2 response without success/statusCode", () => {
    assert.equal(isTaqnyatAccepted(true, accepted), true);
});

test("accepts actual Render-captured template response with a single status object", () => {
    assert.equal(isTaqnyatAccepted(true, {
        type: "template",
        statuses: { message_id: "wamid.test-fixture", recipient: "+966500000000" }
    }), true);
});

test("real sender accepts the captured response through mocked HTTP without sending WhatsApp", () => {
    const result = spawnSync(process.execPath, ["-e", `
        const assert = require("node:assert/strict");
        globalThis.fetch = async (url, options) => {
            assert.equal(url, "https://api.taqnyat.sa/wa/v2/messages/");
            const body = JSON.parse(options.body);
            assert.equal(body.template.components[0].parameters[0].text, "0123");
            return new Response(JSON.stringify({
                type: "template",
                statuses: {message_id: "wamid.test-fixture", recipient: "+966500000000"}
            }), {status: 200});
        };
        require("./taqnyatWhatsApp.js").sendTaqnyatOTP("0500000000", "0123").then(result => {
            assert.equal(result.success, true);
        }).catch(() => {process.exitCode = 1;});
    `], {
        cwd: __dirname,
        env: { PATH: process.env.PATH, TAQNYAT_API_KEY: "fixture-not-a-real-key" },
        encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
});

test("actual template response still requires HTTP success and a valid acknowledgement", () => {
    const template = { type: "template", statuses: { message_id: "wamid.test-fixture" } };
    assert.equal(isTaqnyatAccepted(false, template), false);
    for (const data of [
        { type: "template", statuses: {} },
        { type: "template", statuses: { message_id: "" } },
        { type: "template", statuses: { message_id: "fixture", state: "failed" } },
        { ...template, statusCode: 403 },
        { ...template, statusCode: "400" },
        { statusCode: 403, message: "fixture rejection" },
        { statusCode: 400, message: "fixture rejection" }
    ]) {
        assert.equal(isTaqnyatAccepted(true, data), false);
    }
});

test("HTTP failure cannot be disguised as an accepted message", () => {
    assert.equal(isTaqnyatAccepted(false, accepted), false);
    assert.equal(isTaqnyatAccepted(false, { success: true }), false);
});

test("empty, malformed and explicitly rejected responses stay failures", () => {
    for (const data of [
        null, {}, { type: "whatsapp", statuses: [] },
        { type: "whatsapp", statuses: [{ recipient: "+966500000000" }] },
        { type: "whatsapp", statuses: [{ message_id: "" }] },
        { ...accepted, success: false },
        { ...accepted, error: { code: "fixture" } },
        { type: "whatsapp", statuses: [{ message_id: "fixture", state: "failed" }] },
        { message: "401", reason: "No such bot/bearer combination" },
        { success: "false" }
    ]) {
        assert.equal(isTaqnyatAccepted(true, data), false);
    }
});

test("keeps explicit successful legacy acknowledgements supported", () => {
    for (const data of [{ statusCode: 201 }, { statusCode: "200" }, { status: "success" }, { success: true }]) {
        assert.equal(isTaqnyatAccepted(true, data), true);
    }
});
