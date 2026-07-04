/** Provider-agnostic messaging contract (WhatsApp). Phones in E.164. */
export interface MessagingProvider {
  /** Phase A returns a wa.me click-to-chat link; Phase B actually sends. */
  sendPropertyDetails(toE164: string, params: { propertyTitle: string; url?: string }): Promise<MessagingResult>;
  sendFollowUp(toE164: string, params: { message: string }): Promise<MessagingResult>;
  sendDocument(toE164: string, params: { documentUrl: string; caption?: string }): Promise<MessagingResult>;
}

export interface MessagingResult {
  /** For wa-link provider, this is the wa.me URL to open. For API providers, the message id. */
  ref: string;
  status: "link" | "queued" | "sent" | "failed";
}
