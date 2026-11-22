import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "next-env.d.ts"]),
  {
    files: [
      "components/pages/**",
      "components/dashboard/**",
      "components/finance/**",
      "components/booking/**",
      "components/audit/**",
      "components/knowledge/**",
      "components/schedule/**",
      "components/analytics/**",
      "components/ui/**",
      "components/ChatWidget.tsx",
      "components/NavBar.tsx",
      "components/BookingCardView.tsx",
      "app/api/**",
      "lib/**",
    ],
    ignores: ["app/api/contact/**", "lib/site.ts", "lib/photos.ts", "lib/demo-data.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@next/next/no-html-link-for-pages": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "prefer-rest-params": "off",
    },
  },
]);

export default eslintConfig;
