import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@contactsnap/shared-types": path.join(root, "packages/shared-types/src/index.ts"),
      "@contactsnap/parser": path.join(root, "packages/parser/src/index.ts"),
      "@contactsnap/integrations-google": path.join(root, "packages/integrations-google/src/index.ts"),
      "@contactsnap/integrations-microsoft": path.join(root, "packages/integrations-microsoft/src/index.ts"),
      "@contactsnap/ui": path.join(root, "packages/ui/src/index.tsx")
    }
  },
  server: {
    port: 5173
  }
});
