import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
  House rules (CLAUDE.md):
  - no-raw-color: components never carry hex, rgb, or hsl literals; they use design tokens.
  - no-dash-characters: no em dash or en dash in any string literal, template, or JSX text.
*/
const dashPattern = "[\\u2013\\u2014]";
const rawColorPattern = "(#[0-9a-fA-F]{3,8}\\b|\\brgba?\\(|\\bhsla?\\()";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "coverage/**", "playwright-report/**", "test-results/**"]),
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${dashPattern}/]`,
          message: "No em dashes or en dashes. Use a comma, colon, parentheses, or a separate sentence.",
        },
        {
          selector: `TemplateElement[value.raw=/${dashPattern}/]`,
          message: "No em dashes or en dashes. Use a comma, colon, parentheses, or a separate sentence.",
        },
        {
          selector: `JSXText[value=/${dashPattern}/]`,
          message: "No em dashes or en dashes. Use a comma, colon, parentheses, or a separate sentence.",
        },
      ],
    },
  },
  {
    files: ["components/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${dashPattern}/]`,
          message: "No em dashes or en dashes. Use a comma, colon, parentheses, or a separate sentence.",
        },
        {
          selector: `TemplateElement[value.raw=/${dashPattern}/]`,
          message: "No em dashes or en dashes. Use a comma, colon, parentheses, or a separate sentence.",
        },
        {
          selector: `JSXText[value=/${dashPattern}/]`,
          message: "No em dashes or en dashes. Use a comma, colon, parentheses, or a separate sentence.",
        },
        {
          selector: `Literal[value=/${rawColorPattern}/]`,
          message: "No raw colors in components. Use a design token from app/globals.css.",
        },
        {
          selector: `TemplateElement[value.raw=/${rawColorPattern}/]`,
          message: "No raw colors in components. Use a design token from app/globals.css.",
        },
      ],
    },
  },
]);

export default eslintConfig;
