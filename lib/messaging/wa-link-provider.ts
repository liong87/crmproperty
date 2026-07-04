import type { MessagingProvider, MessagingResult } from "./interface";

/** Phase A: free WhatsApp click-to-chat via wa.me. No API keys required. */
function waLink(toE164: string, text: string): MessagingResult {
  const phone = toE164.replace(/[^0-9]/g, ""); // wa.me wants digits only
  const ref = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  return { ref, status: "link" };
}

export const waLinkProvider: MessagingProvider = {
  async sendPropertyDetails(toE164, { propertyTitle, url }) {
    const text = `Hi! Here are the details for ${propertyTitle}${url ? `: ${url}` : ""}`;
    return waLink(toE164, text);
  },
  async sendFollowUp(toE164, { message }) {
    return waLink(toE164, message);
  },
  async sendDocument(toE164, { documentUrl, caption }) {
    return waLink(toE164, `${caption ? caption + " " : ""}${documentUrl}`);
  },
};
