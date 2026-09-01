/**
 * Which question on an ad-platform form answers which of our fields.
 *
 * Why this exists: Meta's STANDARD questions have predictable keys (`full_name`,
 * `phone_number`), and the heuristics in `server/leads/meta-map.ts` handle those well.
 * Custom questions do not. A form whose phone question is labelled "Nombor telefon"
 * produces the key `nombor_telefon`, which matches nothing, and the lead arrives with
 * no number — a paid lead nobody can call.
 *
 * So the guess stays as the default, and this is the override: the manager says, once
 * per form, which question is the phone. Every value here is a QUESTION KEY as the
 * platform reports it, not a label.
 */
export interface LeadFieldMap {
  name?: string;
  phone?: string;
  email?: string;
  interest?: string;
  preferredAreas?: string;
  consent?: string;
}

/** The fields a form can be mapped onto, in the order the mapping UI shows them. */
export const MAPPABLE_FIELDS = [
  { key: "name", label: "Name", hint: "Full name", required: true },
  { key: "phone", label: "Contact", hint: "Phone number", required: true },
  { key: "email", label: "Email", hint: "Email address", required: false },
  { key: "interest", label: "Interest", hint: "Buy, rent, sell or invest", required: false },
  { key: "preferredAreas", label: "Preferred area", hint: "Where they are looking", required: false },
  { key: "consent", label: "Consent", hint: "PDPA question, if the form asks one", required: false },
] as const satisfies ReadonlyArray<{
  key: keyof LeadFieldMap;
  label: string;
  hint: string;
  required: boolean;
}>;

/** Drops empty selections so an unmapped field is absent rather than "". */
export function cleanFieldMap(raw: Record<string, unknown>): LeadFieldMap {
  const out: LeadFieldMap = {};
  for (const f of MAPPABLE_FIELDS) {
    const v = raw[f.key];
    if (typeof v === "string" && v.trim()) out[f.key] = v.trim();
  }
  return out;
}
