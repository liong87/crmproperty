import { describe, it, expect } from "vitest";
import { mapMetaLead } from "./meta-map";
import { extractLeadgenChanges } from "./meta";
import type { LeadAdRecord } from "@/lib/leadads";

const record = (fields: Record<string, string>, over: Partial<LeadAdRecord> = {}): LeadAdRecord => ({
  externalId: "lead-1",
  formId: "form-1",
  fields,
  campaignId: "camp-1",
  campaignName: "Skyline August",
  adId: "ad-1",
  adName: "Carousel A",
  adsetName: "KL 25-45",
  createdAt: new Date("2026-08-20T04:00:00Z"),
  ...over,
});

const mapping = { projectId: "11111111-1111-4111-8111-111111111111", defaultInterest: "buy", label: "Skyline — Aug" };

describe("mapMetaLead — Meta's standard field names", () => {
  it("maps a straightforward submission", () => {
    const m = mapMetaLead(
      record({ full_name: "Tan Wei Ming", phone_number: "+60123456789", email: "tan@example.my", city: "Petaling Jaya" }),
      mapping,
    );
    expect(m.name).toBe("Tan Wei Ming");
    expect(m.phone).toBe("+60123456789");
    expect(m.email).toBe("tan@example.my");
    expect(m.preferredAreas).toBe("Petaling Jaya");
    expect(m.projectId).toBe(mapping.projectId);
    expect(m.sourceDetail).toBe("Skyline — Aug");
  });

  it("joins first and last name when there is no full name", () => {
    const m = mapMetaLead(record({ first_name: "Siti", last_name: "Nurhaliza", phone_number: "0123456789" }), null);
    expect(m.name).toBe("Siti Nurhaliza");
  });

  it("normalises the phone formats real users type", () => {
    expect(mapMetaLead(record({ phone_number: "012-345 6789" }), null).phone).toBe("+60123456789");
    expect(mapMetaLead(record({ phone_number: "60123456789" }), null).phone).toBe("+60123456789");
  });

  it("leaves the phone empty when it cannot be normalised, so intake rejects it loudly", () => {
    expect(mapMetaLead(record({ phone_number: "12345" }), null).phone).toBe("");
  });

  it("groups the campaign by NAME, since an id is unreadable in a report", () => {
    expect(mapMetaLead(record({}), null).utmCampaign).toBe("Skyline August");
  });

  it("falls back to the campaign id when Meta returns no name", () => {
    expect(mapMetaLead(record({}, { campaignName: null }), null).utmCampaign).toBe("camp-1");
  });

  it("always attributes the lead to paid social", () => {
    const m = mapMetaLead(record({}), null);
    expect(m.utmSource).toBe("meta");
    expect(m.utmMedium).toBe("paid-social");
  });
});

describe("mapMetaLead — interest", () => {
  it("reads our own vocabulary directly", () => {
    expect(mapMetaLead(record({ interest: "rent" }), null).interest).toBe("rent");
  });
  it("recognises how people actually answer, in English and Malay", () => {
    expect(mapMetaLead(record({ i_am_looking_to: "I want to buy a home" }), null).interest).toBe("buy");
    expect(mapMetaLead(record({ looking_to: "Nak sewa" }), null).interest).toBe("rent");
    expect(mapMetaLead(record({ purpose: "For investment" }), null).interest).toBe("invest");
  });
  it("falls back to the mapping default when the answer means nothing to us", () => {
    expect(mapMetaLead(record({ interest: "just browsing" }), mapping).interest).toBe("buy");
  });
  it("is null when there is no answer and no default", () => {
    expect(mapMetaLead(record({}), null).interest).toBeNull();
  });
});

describe("mapMetaLead — PDPA consent", () => {
  it("honours an explicit consent question", () => {
    const yes = mapMetaLead(record({ pdpa_consent: "Yes" }), null);
    expect(yes.consentGiven).toBe(true);
    expect(yes.consentSource).toContain("form-consent-question");
  });
  it("records a refusal as a refusal", () => {
    const no = mapMetaLead(record({ pdpa_consent: "No" }), null);
    expect(no.consentGiven).toBe(false);
    expect(no.consentSource).toContain("form-consent-question");
  });
  it("falls back to the form's privacy policy, and says so in the record", () => {
    const m = mapMetaLead(record({ full_name: "A" }), null);
    expect(m.consentGiven).toBe(true);
    // The basis of the claim must be auditable, not merely asserted.
    expect(m.consentSource).toBe("meta:form-privacy-policy:form-1");
  });
});

describe("mapMetaLead — custom questions", () => {
  it("keeps answers that have no column of their own", () => {
    const m = mapMetaLead(
      record({ full_name: "A", phone_number: "0123456789", when_are_you_looking_to_move: "Within 3 months" }),
      null,
    );
    expect(m.extraAnswers).toEqual({ when_are_you_looking_to_move: "Within 3 months" });
  });
  it("does not duplicate fields that were already mapped", () => {
    const m = mapMetaLead(record({ full_name: "A", phone_number: "0123456789", email: "a@b.my" }), null);
    expect(m.extraAnswers).toEqual({});
  });
});

describe("extractLeadgenChanges", () => {
  it("pulls every leadgen change out of a batched delivery", () => {
    const body = {
      object: "page",
      entry: [
        { id: "p1", changes: [{ field: "leadgen", value: { leadgen_id: "a", form_id: "f1" } }] },
        {
          id: "p2",
          changes: [
            { field: "leadgen", value: { leadgen_id: "b", form_id: "f2" } },
            { field: "leadgen", value: { leadgen_id: "c", form_id: "f2" } },
          ],
        },
      ],
    };
    expect(extractLeadgenChanges(body).map((c) => c.leadgen_id)).toEqual(["a", "b", "c"]);
  });

  it("ignores fields other than leadgen sharing the same envelope", () => {
    const body = { entry: [{ changes: [{ field: "feed", value: { post_id: "x" } }] }] };
    expect(extractLeadgenChanges(body)).toEqual([]);
  });

  it("ignores a leadgen change with no id, rather than throwing", () => {
    const body = { entry: [{ changes: [{ field: "leadgen", value: { form_id: "f1" } }] }] };
    expect(extractLeadgenChanges(body)).toEqual([]);
  });

  it("survives the shapes a test ping or a malformed body can take", () => {
    for (const body of [null, undefined, {}, { entry: null }, { entry: [{}] }, { entry: [{ changes: "no" }] }]) {
      expect(extractLeadgenChanges(body)).toEqual([]);
    }
  });
});
