import { consoleProvider } from "./console-provider";
import type { MonitoringProvider } from "./interface";

/**
 * Active monitoring provider. Swap this single line to change vendor —
 * no app code imports a monitoring SDK directly.
 */
export const monitoring: MonitoringProvider = consoleProvider;
export type { MonitoringProvider } from "./interface";
