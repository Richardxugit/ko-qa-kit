// packages/kit-core/src/manifest.js
//
// Each kit writes its own manifest at a caller-supplied relative path (e.g.
// .cursor/.ko-dev-kit-manifest.json) so multiple kits can coexist in one
// consumer repo without clobbering each other's orphan-pruning state.
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';

export async function readManifest(projectDir, manifestRelPath) {
  const manifestPath = path.join(projectDir, manifestRelPath);
  if (!await fs.pathExists(manifestPath)) return null;
  try {
    return await fs.readJson(manifestPath);
  } catch {
    return null;
  }
}

/**
 * Write the manifest, hashing each owned file's current disk content.
 * Files missing from disk (e.g. skipped by --no-overwrite races) are omitted.
 */
export async function writeManifest(projectDir, manifestRelPath, { kitVersion, archetype, files }) {
  const entries = [];
  for (const rel of [...files].sort()) {
    const abs = path.join(projectDir, rel);
    if (!await fs.pathExists(abs)) continue;
    entries.push({ path: rel, sha256: await hashFile(abs) });
  }
  const manifest = {
    kitVersion,
    archetype,
    installedAt: new Date().toISOString(),
    files: entries,
  };
  await fs.ensureDir(path.dirname(path.join(projectDir, manifestRelPath)));
  await fs.writeJson(path.join(projectDir, manifestRelPath), manifest, { spaces: 2 });
  return manifest;
}

/**
 * Does any OTHER installed kit's manifest still claim this path? Scans every
 * sibling `.cursor/.ko-*-manifest.json` except the caller's own, so deleting
 * a file this kit no longer owns never breaks a kit that still needs it.
 */
export async function otherKitsClaim(projectDir, relPath, selfManifestRelPath) {
  const cursorDir = path.join(projectDir, '.cursor');
  if (!await fs.pathExists(cursorDir)) return false;
  const selfName = path.basename(selfManifestRelPath);
  const entries = await fs.readdir(cursorDir);
  const siblings = entries.filter(f => /^\.ko-.+-manifest\.json$/.test(f) && f !== selfName);
  for (const f of siblings) {
    const manifest = await fs.readJson(path.join(cursorDir, f)).catch(() => null);
    if (manifest?.files?.some(entry => entry.path === relPath)) return true;
  }
  return false;
}

/**
 * Remove files the old manifest recorded that the current scaffold no longer
 * ships. A file is removed only when its disk content still matches the
 * recorded hash (a user-modified file is kept) AND no other installed kit's
 * manifest still claims it (a cross-kit-shared file is kept too, reported
 * separately in `shared`).
 *
 * @param {string} projectDir
 * @param {string[]} currentFiles - relative paths the current scaffold owns
 * @param {object|null} oldManifest
 * @param {{ selfManifestRelPath?: string }} [options] - pass selfManifestRelPath
 *   to enable the cross-kit check; omitted, behavior is single-kit (as before).
 * @returns {{ removed: string[], kept: string[], shared: string[] }}
 */
export async function pruneOrphans(projectDir, currentFiles, oldManifest, options = {}) {
  const { selfManifestRelPath } = options;
  const removed = [];
  const kept = [];
  const shared = [];
  if (!oldManifest?.files) return { removed, kept, shared };

  const current = new Set(currentFiles);
  for (const entry of oldManifest.files) {
    if (current.has(entry.path)) continue;
    const abs = path.join(projectDir, entry.path);
    if (!await fs.pathExists(abs)) continue;
    if (await hashFile(abs) !== entry.sha256) {
      kept.push(entry.path);
      continue;
    }
    if (selfManifestRelPath && await otherKitsClaim(projectDir, entry.path, selfManifestRelPath)) {
      shared.push(entry.path);
      continue;
    }
    await fs.remove(abs);
    removed.push(entry.path);
  }
  return { removed, kept, shared };
}

async function hashFile(absPath) {
  const content = await fs.readFile(absPath);
  return crypto.createHash('sha256').update(content).digest('hex');
}
