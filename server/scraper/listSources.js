// Prints the supported careers sources (from the adapter registry), so the README can state them.
// Run with `npm run list:sources`. Reads nothing from data/, makes no request.
import { supportedSources } from "./adapters/registry.js";

const sources = supportedSources();
console.log(`Supported careers sources (${sources.length}):`);
for (const { id, name } of sources) console.log(`  ${id.padEnd(12)} ${name}`);
