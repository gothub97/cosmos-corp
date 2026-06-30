#!/usr/bin/env node
/**
 * sync-version - propagate the package.json version into the Tauri app config.
 *
 * Changesets only bumps package.json. The actual macOS app version comes from
 * src-tauri/tauri.conf.json (and src-tauri/Cargo.toml), so without this they
 * drift: package.json says 0.2.0 while the built app still reports 0.1.0.
 *
 * Run automatically by the `version-packages` script right after
 * `changeset version`, so the three stay in lockstep.
 */

import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const version = JSON.parse(readFileSync(new URL("package.json", root))).version;

// tauri.conf.json
const confPath = new URL("src-tauri/tauri.conf.json", root);
const conf = JSON.parse(readFileSync(confPath));
conf.version = version;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

// src-tauri/Cargo.toml - only the [package] version (the first top-level
// `version = "..."` line; dependency versions never start a line with `version`).
const cargoPath = new URL("src-tauri/Cargo.toml", root);
let cargo = readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version = "[^"]*"/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);

console.log(`Synced version ${version} into tauri.conf.json and Cargo.toml`);
