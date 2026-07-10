import { defineConfig } from 'vite';

// The landing page, deployed at the flighthq.ai root (base "/"). Unlike the monorepo's landing config,
// there is NO workspace alias: `@flighthq/sdk` resolves to the published package in node_modules, so
// this builds against exactly what real consumers install. The /reference/ subpath is not built here —
// scripts/assemble.ts merges flight-reference's prebuilt bundle into dist/reference/ after this build.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
});
