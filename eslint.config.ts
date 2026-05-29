import js from "@eslint/js"
import tseslint from "typescript-eslint"

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "quotes": ["error", "double"],
      "semi": ["error", "never"],
      "object-curly-spacing": ["error", "always"],
      "no-unused-vars": "off", 
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
      }],
      "eqeqeq": ["error", "always"],
      "no-console": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "arrow-parens": ["error", "as-needed"],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  }
)