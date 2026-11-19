/// <reference types="vite/client" />
/// <reference types="vite-plugin-monkey/client" />

/** Version aus package.json, wird beim Build von Vite eingesetzt. */
declare const __APP_VERSION__: string;

/** true in Testversionen, false im veröffentlichten Release (siehe core/build.ts). */
declare const __TEST_BUILD__: boolean;
