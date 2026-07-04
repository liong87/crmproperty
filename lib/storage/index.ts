import { r2Provider } from "./r2-provider";
import type { StorageProvider } from "./interface";

export const storage: StorageProvider = r2Provider;
export type { StorageProvider } from "./interface";
