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
    // Prevent duplicate React copies when importing the shared ACP UI package.
    dedupe: ["react", "react-dom"],
  },
});
