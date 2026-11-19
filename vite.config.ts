import { defineConfig } from 'vitest/config';
import monkey from 'vite-plugin-monkey';
import pkg from './package.json' with { type: 'json' };

const repoUrl = 'https://github.com/juliannoah/churchtools-power-tools';
// Zeigt immer auf das neueste GitHub-Release, damit Tampermonkey/Violentmonkey
// Updates automatisch findet.
const releaseBase = `${repoUrl}/releases/latest/download`;
const fileName = 'churchtools-power-tools.user.js';
const metaFileName = 'churchtools-power-tools.meta.js';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Unter Vitest wird das Userscript-Plugin nicht gebraucht.
  plugins: process.env.VITEST
    ? []
    : [
        monkey({
          entry: 'src/main.ts',
          userscript: {
            name: 'ChurchTools Power-Tools',
            namespace: repoUrl,
            description:
              'Verwaltungs-Werkzeuge für ChurchTools, z. B. mehrere Termine auf einmal löschen.',
            author: 'juliannoah',
            homepageURL: repoUrl,
            supportURL: `${repoUrl}/issues`,
            updateURL: `${releaseBase}/${metaFileName}`,
            downloadURL: `${releaseBase}/${fileName}`,
            // Läuft auf jeder ChurchTools-Instanz; die Basis-URL kommt zur
            // Laufzeit aus window.location.origin.
            match: ['https://*.church.tools/*'],
            'run-at': 'document-idle',
            noframes: true,
          },
          build: {
            fileName,
            metaFileName,
          },
        }),
      ],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
