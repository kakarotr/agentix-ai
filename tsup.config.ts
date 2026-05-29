import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  tsconfig: "tsconfig.build.json",

  esbuildOptions(options) {
    options.alias = {
      "@": "./src",
    };
  },
});
