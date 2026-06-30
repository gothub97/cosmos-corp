#!/usr/bin/env node
/**
 * tag-release - the "publish" step of the Changesets release flow.
 *
 * Cosmos Corp is a desktop app, not an npm package, so there's nothing to
 * publish to a registry. Instead, once Changesets has consumed the pending
 * changesets and bumped `package.json` (the "Version Packages" PR is merged),
 * this script creates an annotated `v<version>` tag and pushes it. That tag push
 * is what triggers `.github/workflows/release.yml` to build the macOS bundle and
 * attach it to a GitHub Release.
 *
 * It is idempotent: if the tag for the current version already exists, it exits
 * cleanly without re-tagging.
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const tag = `v${version}`;

const existing = run("git tag --list").split("\n");
if (existing.includes(tag)) {
  console.log(`Tag ${tag} already exists - nothing to do.`);
  process.exit(0);
}

console.log(`Creating release tag ${tag}`);
execSync(`git tag -a ${tag} -m "Release ${tag}"`, { stdio: "inherit" });
execSync(`git push origin ${tag}`, { stdio: "inherit" });
console.log(`Pushed ${tag}. The release workflow will build and publish the bundle.`);
