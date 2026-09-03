import { alertProvider } from "./alert-provider";
import type { MonitoringProvider } from "./interface";

/**
 * Active monitoring provider. Swap this single line to change vendor —
 * no app code imports a monitoring SDK directly.
 *
 * `alertProvider` logs exactly as `consoleProvider` did and additionally pushes
 * exceptions to `MONITORING_WEBHOOK_URL` when that is set. With it unset the two are
 * behaviourally identical, so this is safe to deploy before the webhook exists.
 */
export const monitoring: MonitoringProvider = alertProvider;
export type { MonitoringProvider } from "./interface";
