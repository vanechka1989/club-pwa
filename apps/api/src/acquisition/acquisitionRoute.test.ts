import { describe, expect, it, vi } from "vitest";
import { createAcquisitionRoute } from "../routes/acquisition";

describe("public acquisition visit route", () => {
  it("records a valid landing and returns only an allowlisted destination", async () => {
    const record = vi.fn().mockResolvedValue({ accepted: true, destination: { kind: "billing" } });
    const response = await createAcquisitionRoute(record).request("/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aid: "telegram-july", visitorId: "0b70f8c3-ea3d-4544-9fe7-1be6e495cadc" })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, destination: { kind: "billing" } });
    expect(record).toHaveBeenCalledWith({ aid: "telegram-july", visitorId: "0b70f8c3-ea3d-4544-9fe7-1be6e495cadc" });
  });

  it("does not break landing when analytics storage fails", async () => {
    const response = await createAcquisitionRoute(async () => {
      throw new Error("database unavailable");
    }).request("/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aid: "telegram-july", visitorId: "0b70f8c3-ea3d-4544-9fe7-1be6e495cadc" })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: false, destination: { kind: "home" } });
  });

  it("rejects malformed public ids", async () => {
    const response = await createAcquisitionRoute(vi.fn()).request("/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aid: "<script>", visitorId: "bad" })
    });
    expect(response.status).toBe(400);
  });
});
