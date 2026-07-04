import { resendProvider } from "./resend-provider";
import type { EmailProvider } from "./interface";

export const email: EmailProvider = resendProvider;
export type { EmailProvider, EmailMessage } from "./interface";
