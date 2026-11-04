/** @type {import('jest').Config} */
module.exports = {
  rootDir: ".",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.ts$",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: "<rootDir>/tsconfig.json", isolatedModules: true },
    ],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  testEnvironment: "node",
};
