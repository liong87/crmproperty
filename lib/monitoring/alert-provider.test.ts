import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { alertProvider } from "./alert-provider";

/**
 * The alerting path has three jobs, and two of them are about NOT doing harm:
 * it must never leak client PII into a third-party chat channel, and it must never
 * make a failing request worse. The third is that it actually fires.
 */
describe("alertProvider", () => {
  let posted: { url: string; body: Record<string, unknown> }[];

  beforeEach(() => {
    posted = [];
    process.env.MONITORING_WEBHOOK_URL = "https://hooks.example.test/abc";
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      posted.push({ url, body: JSON.parse(String(init.body)) });
      return Promise.resolve(new Response("ok"));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.MONITORING_WEBHOOK_URL;
  });

  it("posts an alert for an exception", () => {
    alertProvider.captureException(new Error("boom"), { where: "leads:create" });
    expect(posted).toHaveLength(1);
    expect(posted[0]!.url).toBe("https://hooks.example.test/abc");
    // Both keys, so one URL works for Slack or Discord.
    expect(posted[0]!.body.text).toContain("leads:create");
    expect(posted[0]!.body.content).toBe(posted[0]!.body.text);
  });

  it("NEVER sends client PII", () => {
    // A lead's row reaching a Slack channel is an unlogged, un-erasable second copy
    // of PDPA data in a system the agency does not control.
    alertProvider.captureException(new Error("insert failed"), {
      where: "intake",
      phone: "+60123456789",
      email: "buyer@example.com",
      name: "A Real Buyer",
      leadId: "1234",
    });
    const sent = JSON.stringify(posted[0]!.body);
    expect(sent).not.toContain("+60123456789");
    expect(sent).not.toContain("buyer@example.com");
    expect(sent).not.toContain("A Real Buyer");
    // Non-identifying context still comes through, or the alert is useless.
    expect(sent).toContain("1234");
    expect(sent).toContain("[redacted]");
  });

  it("mutes a repeat of the same fault so a hot loop cannot flood the channel", () => {
    for (let i = 0; i < 50; i++) {
      alertProvider.captureException(new Error("same fault"), { where: "reports" });
    }
    expect(posted).toHaveLength(1);
  });

  it("still alerts on a DIFFERENT fault from the same place", () => {
    alertProvider.captureException(new Error("fault one"), { where: "shared" });
    alertProvider.captureException(new Error("fault two"), { where: "shared" });
    expect(posted).toHaveLength(2);
  });

  it("logs but does not post when no webhook is configured", () => {
    delete process.env.MONITORING_WEBHOOK_URL;
    alertProvider.captureException(new Error("quiet"), { where: "nowhere" });
    expect(posted).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
  });

  it("logs the exception even when delivery throws", () => {
    // An alerting system that can break the app it watches is worse than none.
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
    expect(() =>
      alertProvider.captureException(new Error("still logged"), { where: "x" }),
    ).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  it("does not alert on informational messages", () => {
    // Alerting on these trains everyone to ignore the channel.
    alertProvider.captureMessage("Meta leadgen not found", { leadgenId: "9" });
    expect(posted).toHaveLength(0);
  });
});
