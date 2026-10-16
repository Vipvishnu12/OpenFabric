const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  test: {
    include: ["tests/**/*.ts"],
    exclude: ["dist/**", "node_modules/**"],
    globals: true,
  },
});