/**
 * Creating and listing Meta lead forms from inside the CRM.
 *
 * Two things about Meta's model shape everything here, and both are worth knowing
 * before using this screen:
 *
 *  1. A form CANNOT BE EDITED once it exists. Meta allows create and archive, nothing
 *     between — a form that has taken a lead is a permanent record of what that person
 *     was asked. So the create screen is a commitment, and the UI says so.
 *  2. A new form is created in DRAFT and becomes ACTIVE the moment an ad uses it.
 *     A draft is invisible until then, which reads as failure if you do not expect it.
 *
 * Needs a Page token with `pages_manage_ads` in addition to the `leads_retrieval` the
 * webhook already uses. Credentials are passed in rather than read from the
 * environment, because the connected page now lives in the database — see
 * server/lead-sources/credentials.ts.
 */
import {
  LeadAdsTransientError,
  type AdPlatformCredentials,
  type CreateLeadFormInput,
  type LeadFormsProvider,
  type RemoteFormQuestion,
  type RemoteLeadForm,
} from "./interface";

const DEFAULT_VERSION = "v21.0";

interface GraphForm {
  id?: string;
  name?: string;
  status?: string;
  leads_count?: number;
  created_time?: string;
}

function graph(path: string): string {
  const version = process.env.META_GRAPH_VERSION || DEFAULT_VERSION;
  return `https://graph.facebook.com/${version}/${path}`;
}

function toForm(f: GraphForm, fallbackId = ""): RemoteLeadForm {
  const created = f.created_time ? new Date(f.created_time) : null;
  return {
    id: f.id ?? fallbackId,
    name: f.name ?? "(unnamed form)",
    status: f.status ?? null,
    leadsCount: typeof f.leads_count === "number" ? f.leads_count : null,
    createdAt: created && !Number.isNaN(created.getTime()) ? created : null,
  };
}

/**
 * Graph errors arrive as JSON with a human-readable message that is genuinely more
 * useful than anything we could write — an expired token, a missing scope and an
 * unreachable privacy URL all say so plainly. Surface it rather than replacing it.
 */
async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; error_user_msg?: string } };
    const msg = parsed.error?.error_user_msg || parsed.error?.message;
    if (msg) return msg;
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return `Graph API ${res.status}: ${body.slice(0, 300)}`;
}

export class MetaLeadFormsProvider implements LeadFormsProvider {
  async listForms({ accountId: pageId, token }: AdPlatformCredentials): Promise<RemoteLeadForm[]> {
    const url = graph(
      `${encodeURIComponent(pageId)}/leadgen_forms` +
        `?fields=id,name,status,leads_count,created_time&limit=100` +
        `&access_token=${encodeURIComponent(token)}`,
    );

    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new LeadAdsTransientError(`Graph API unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) throw new LeadAdsTransientError(await readError(res));

    const data = (await res.json()) as { data?: GraphForm[] };
    // One page of 100. An agency with more live forms than that has a different
    // problem, and paginating here would hide it rather than solve it.
    return (data.data ?? []).map((f) => toForm(f));
  }

  async listQuestions(
    { token }: AdPlatformCredentials,
    formId: string,
  ): Promise<RemoteFormQuestion[]> {
    const url = graph(
      `${encodeURIComponent(formId)}?fields=questions&access_token=${encodeURIComponent(token)}`,
    );

    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new LeadAdsTransientError(`Graph API unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) throw new LeadAdsTransientError(await readError(res));

    const data = (await res.json()) as {
      questions?: Array<{ key?: string; label?: string; type?: string }>;
    };
    return (data.questions ?? [])
      .filter((q): q is { key: string; label?: string; type?: string } => Boolean(q?.key))
      .map((q) => ({
        // Answers come back keyed in lower case, so the mapping has to be stored that
        // way or it will never match what arrives.
        key: q.key.toLowerCase(),
        label: q.label ?? q.key,
        type: q.type ?? null,
      }));
  }

  async createForm(
    { accountId: pageId, token }: AdPlatformCredentials,
    input: CreateLeadFormInput,
  ): Promise<RemoteLeadForm> {

    // Meta wants each of these as a JSON-encoded STRING inside form-encoded params,
    // not as nested JSON. Sending real nested JSON fails with a confusing type error.
    const questions = input.questions.map((q) =>
      q.type === "CUSTOM"
        ? {
            type: "CUSTOM",
            key: q.key,
            label: q.label,
            ...(q.options?.length
              ? { options: q.options.map((o, i) => ({ key: `opt_${i + 1}`, value: o })) }
              : {}),
          }
        : { type: q.type },
    );

    const params = new URLSearchParams({
      name: input.name,
      questions: JSON.stringify(questions),
      privacy_policy: JSON.stringify({
        url: input.privacyPolicyUrl,
        link_text: input.privacyLinkText || "Privacy Policy",
      }),
      locale: "EN_US",
      access_token: token,
    });
    if (input.followUpUrl) params.set("follow_up_action_url", input.followUpUrl);
    if (input.introHeadline && input.introBody) {
      params.set(
        "context_card",
        JSON.stringify({
          title: input.introHeadline,
          style: "LIST_STYLE",
          content: [input.introBody],
          button_text: "Continue",
        }),
      );
    }

    let res: Response;
    try {
      res = await fetch(graph(`${encodeURIComponent(pageId)}/leadgen_forms`), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: params.toString(),
      });
    } catch (err) {
      throw new LeadAdsTransientError(`Graph API unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) throw new LeadAdsTransientError(await readError(res));

    // The create response carries only the id, so the rest is what we just sent.
    const created = (await res.json()) as { id?: string };
    if (!created.id) throw new LeadAdsTransientError("Meta accepted the form but returned no id.");
    return { id: created.id, name: input.name, status: "DRAFT", leadsCount: 0, createdAt: new Date() };
  }
}
