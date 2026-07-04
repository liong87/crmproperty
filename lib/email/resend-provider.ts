import { Resend } from "resend";
import type { EmailProvider } from "./interface";

const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.EMAIL_FROM ?? "PropertyAgent <no-reply@example.com>";

export const resendProvider: EmailProvider = {
  async send({ to, subject, html, text }) {
    const { data, error } = await resend.emails.send({ from, to, subject, html, text });
    if (error) throw new Error(`EMAIL_SEND_FAILED: ${error.message}`);
    return { id: data?.id ?? "" };
  },
};
