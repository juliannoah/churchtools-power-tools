/**
 * Art des Builds. Testversionen (lokaler Build, `npm run preview`) bieten
 * zusätzlich den Trockenlauf an; im veröffentlichten Release gibt es ihn
 * nicht. Gesteuert über die Umgebungsvariable `RELEASE_BUILD` beim Build
 * (siehe vite.config.ts und .github/workflows/release.yml).
 */
export function isTestBuild(): boolean {
  return __TEST_BUILD__;
}
