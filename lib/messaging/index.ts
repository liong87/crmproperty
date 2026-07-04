import { waLinkProvider } from "./wa-link-provider";
import type { MessagingProvider } from "./interface";

// Phase A default. Phase B: swap to a Cloud API / Twilio provider behind the same interface.
const provider: MessagingProvider = waLinkProvider;

export const messaging: MessagingProvider = provider;
export type { MessagingProvider, MessagingResult } from "./interface";
