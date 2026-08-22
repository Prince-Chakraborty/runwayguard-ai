import { describe, it, expect } from "vitest";
import crypto from "crypto";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe("webhook processor", () => {
  it("processes a valid new event", async () => {
    const eventId = `evt_vitest_${Date.now()}`;
    const res = await fetch(`${BASE_URL}/api/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: eventId, event: "payout.processed", payload: { amount: 1000 } }),
    });
    const data = await res.json();
    expect(data.status).toBe("processed");
  });

  it("no-ops on a redelivered event with the same id", async () => {
    const eventId = `evt_vitest_dupe_${Date.now()}`;
    const payload = { id: eventId, event: "payout.processed", payload: { amount: 1000 } };

    const first = await fetch(`${BASE_URL}/api/webhooks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    expect((await first.json()).status).toBe("processed");

    const second = await fetch(`${BASE_URL}/api/webhooks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    expect((await second.json()).status).toBe("already_processed");
  });

  it("rejects malformed JSON", async () => {
    const res = await fetch(`${BASE_URL}/api/webhooks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{not valid json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a payload missing required fields", async () => {
    const res = await fetch(`${BASE_URL}/api/webhooks`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foo: "bar" }),
    });
    expect(res.status).toBe(400);
  });
});
