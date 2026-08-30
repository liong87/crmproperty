import { Resend } from "resend";
import type { EmailProvider } from "./interface";

/**
 * The client is created LAZILY. Constructing it at module scope with no API key
 * throws, and this module is imported by the notification layer, which runs on paths
 * that must not fail because an optional channel is unconfigured.
 */
let client: Resend | null = null;
function resend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("EMAIL_NOT_CONFIGURED: RESEND_API_KEY is not set");
  client ??= new Resend(key);
  return client;
}

export const resendProvider: EmailProvider = {
  async send({ to, subject, html, text }) {
    const from = process.env.EMAIL_FROM;
    if (!from) throw new Error("EMAIL_NOT_CONFIGURED: EMAIL_FROM is not set");
    const { data, error } = await resend().emails.send({ from, to, subject, html, text });
    if (error) throw new Error(`EMAIL_SEND_FAILED: ${error.message}`);
    return { id: data?.id ?? "" };
  },
};
