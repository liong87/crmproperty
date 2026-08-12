import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".open-next/**", "_backup_before_patch/**", "_to_delete/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
