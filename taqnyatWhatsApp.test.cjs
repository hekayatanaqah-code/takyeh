"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isTaqnyatAccepted } = require("./taqnyatWhatsApp.js");

const accepted = {
    type: "whatsapp",
    statuses: [{ message_id: "wamid.test-fixture", recipient: "+966500000000" }]
};

test("accepts documented WhatsApp v2 response without success/statusCode", () => {
    assert.equal(isTaqnyatAccepted(true, accepted), true);
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
