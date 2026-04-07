import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";

export default tseslint.config(
  eslint.configs.recommended,
  {
    ignores: ["dist/**", "dist-tests/**", "node_modules/**", "**/*.d.ts"],
  },
  tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.tests.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node, // Adds Node.js globals like 'exports'
        ...globals.commonjs, // Adds CommonJS globals
      },
    },
    plugins: {
      jsdoc: jsdoc
    },
    rules: {
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
        },
        {
          selector: "enumMember",
          format: ["PascalCase"],
        },
      ],
      "@typescript-eslint/no-require-imports": ["error"],
      "@typescript-eslint/promise-function-async": ["error"],
      "@typescript-eslint/return-await": ["error"],
      "jsdoc/require-jsdoc": [
                    "error",
                    {
                        "require": {
                            "ArrowFunctionExpression": false,
                            "ClassDeclaration": true,
                            "ClassExpression": true,
                            "FunctionDeclaration": true,
                            "FunctionExpression": true,
                            "MethodDefinition": true
                        },
                        "contexts": [
                            "FunctionDeclaration",
                            "FunctionExpression",
                            "MethodDefinition",
                            "TSDeclareFunction",
                            "TSEnumDeclaration",
                            "TSInterfaceDeclaration",
                            "TSMethodDeclaration",
                            "TSMethodSignature"
                        ]
                    }
                ],
                "jsdoc/require-param": [
                  "error",
                  {
                      "contexts": [
                          "FunctionDeclaration",
                          "FunctionExpression",
                          "MethodDefinition",
                          "TSDeclareFunction",
                          "TSMethodDeclaration",
                          "TSMethodSignature"
                      ]
                  }
              ],
              "jsdoc/require-param-description": 2,
              "jsdoc/require-param-name": 2,
              "jsdoc/require-param-type": 0,
              "jsdoc/require-returns": [
                "error",
                {
                    "contexts": [
                        "FunctionDeclaration",
                        "FunctionExpression",
                        "MethodDefinition",
                        "TSDeclareFunction",
                        "TSMethodDeclaration",
                        "TSMethodSignature"
                    ]
                }
            ]
    },
  },
  {
    files: ["src/test.ts", "tests/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  }
);
