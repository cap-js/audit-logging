import cds from "@sap/cds/eslint.config.mjs";

export default [
  ...cds.recommended,
  {
    files: ["**/*.js"],
    rules: {
      "no-await-in-loop": "error",
      "no-console": ["error", { allow: ["warn", "error"] }]
    }
  },
  {
    files: ["tests/**"],
    rules: {
      "no-await-in-loop": "off",
      "no-console": "off",
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-redeclare": "off"
    }
  }
];
