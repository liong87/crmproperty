import { describe, it, expect } from "vitest";

/**
 * `addAttachment` used to store whatever storage key the browser sent it.
 *
 * Keys are not secret — they appear in the path of every signed URL an agent opens.
 * So a team leader who had seen `deals/<id>/<uuid>-spa-scan.pdf` could attach that
 * object to a chapter of their own topic and hand working download links to their
 * whole downline, reaching a signed sale agreement on a deal they cannot see.
 *
 * The regex is duplicated here rather than exported, on purpose: this test asserts
 * what the rule OUGHT to be. Importing the implementation would make it agree with
 * itself no matter what the implementation became.
 */
function expectedKeyShape(topicId: string): RegExp {
  return new RegExp(
    `^learning/${topicId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\\.[a-z0-9]{1,8})?$`,
  );
}

const TOPIC = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";
const UUID = "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";
const ok = (k: string) => expectedKeyShape(TOPIC).test(k);

describe("learning attachment storage keys", () => {
  it("accepts what createUploadUrl actually mints", () => {
    expect(ok(`learning/${TOPIC}/${UUID}.mp4`)).toBe(true);
    expect(ok(`learning/${TOPIC}/${UUID}.pdf`)).toBe(true);
    // A file with no extension is legitimate — `safeExt` is "" when there is none.
    expect(ok(`learning/${TOPIC}/${UUID}`)).toBe(true);
  });

  it("refuses another topic's object", () => {
    expect(ok(`learning/${OTHER}/${UUID}.mp4`)).toBe(false);
  });

  it("refuses objects from other parts of the bucket", () => {
    // The actual attack: a deal's signed paperwork.
    expect(ok(`deals/${OTHER}/${UUID}-spa-scan.pdf`)).toBe(false);
    expect(ok(`projects/${OTHER}/kit/${UUID}-price-list.pdf`)).toBe(false);
    expect(ok(`properties/${OTHER}/${UUID}.jpg`)).toBe(false);
    expect(ok("backups/nightly.sql.gz")).toBe(false);
  });

  it("refuses path traversal out of the topic folder", () => {
    expect(ok(`learning/${TOPIC}/../${OTHER}/${UUID}.mp4`)).toBe(false);
    expect(ok(`learning/${TOPIC}/../../deals/${OTHER}/${UUID}.pdf`)).toBe(false);
  });

  it("refuses a prefix that merely starts with the topic id", () => {
    // `learning/<topic>-evil/...` must not pass by sharing a prefix.
    expect(ok(`learning/${TOPIC}-evil/${UUID}.mp4`)).toBe(false);
  });

  it("refuses anything appended after a valid key", () => {
    // Anchoring matters: without $ this would let a crafted suffix through.
    expect(ok(`learning/${TOPIC}/${UUID}.mp4/../../secret.pdf`)).toBe(false);
    expect(ok(`learning/${TOPIC}/${UUID}.mp4 extra`)).toBe(false);
  });

  it("refuses a non-UUID filename", () => {
    expect(ok(`learning/${TOPIC}/anything.mp4`)).toBe(false);
    expect(ok(`learning/${TOPIC}/${UUID.replace("a", "z")}.mp4`)).toBe(false);
  });
});
