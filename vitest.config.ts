import { defineConfig } from "vitest/config"
import path from "path"
import tsconfigPaths from "vite-tsconfig-paths"


export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["tests/tsconfig.json"] })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    },
  },
  test: {
    include: ["tests/**/*.test.ts"]
  }
})