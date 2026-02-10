import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../packages/acp-ui/src"),
    },
    // Prevent duplicate React copies when importing source files from outside
    // this workspace (e.g. ../../packages/acp-ui). Without this, hooks can
    // crash at runtime with: "Cannot read properties of null (reading 'useCallback')".
    dedupe: ["react", "react-dom"],
  },
});
