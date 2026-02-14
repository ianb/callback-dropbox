import { vibeCheck } from "@ianbicking/personal-vibe-check/eslint";
export default [
  ...vibeCheck({ react: true, ignores: ["capture/dist/**"] }),
  {
    rules: {
      "no-optional-chaining/no-optional-chaining": "off",
      "default/no-default-params": "off",
      "max-params": ["error", 2],

      "max-lines": "off",
      "max-lines-per-function": "off",
      "no-restricted-syntax": "off",
      "single-export/single-export": "off",
      "ddd/require-spec-file": "off",
      "default/no-hardcoded-urls": "off",
      "error/require-custom-error": "off",
      "error/no-generic-error": "off",
      "error/no-literal-error-message": "off",
      "error/no-throw-literal": "off",
      "security/detect-object-injection": "off",
      "custom/jsx-classname-required": "off",
    },
  },
];
