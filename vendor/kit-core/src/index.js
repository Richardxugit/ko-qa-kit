// packages/kit-core/src/index.js
export { DEPENDENCY_KEYS, parseFrontmatter } from './frontmatter.js';
export { readManifest, writeManifest, pruneOrphans, otherKitsClaim } from './manifest.js';
export {
  getCommandEntries, scaffoldProject, pruneProject, installResource, uninstallResource,
  installFolder, listAvailableResources, getMcpSuggestions,
} from './scaffold-engine.js';
export { extractDependencies, exportCommand, exportPlugin } from './export.js';
