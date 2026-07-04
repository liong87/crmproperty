import { sentryProvider } from "./sentry-provider";
import type { MonitoringProvider } from "./interface";

export const monitoring: MonitoringProvider = sentryProvider;
export type { MonitoringProvider } from "./interface";
