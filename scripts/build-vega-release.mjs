#!/usr/bin/env node
/**
 * Build the vega.codes release site for the pi fork.
 *
 * Produces a static `dist-site/` tree to deploy on vega.codes (nginx):
 *
 *   pi/install.sh                                    managed installer (POSIX)
 *   pi/install.ps1                                   managed installer (Windows)
 *   pi/api/latest-version                            {"version", "installSpec"}
 *   pi/api/installer/releases/latest                 {"version", "installSpec"}
 *   pi/api/installer/releases/<v>/package.json       managed install manifest
 *   pi/api/installer/releases/<v>/package-lock.json  managed install lockfile
 *   pi/releases/<v>/<pkg>-<v>.tgz                    package tarballs
 *   pi/releases/latest/<pkg>-latest.tgz              same tarballs, stable URLs
 *
 * The fork is not published to an npm registry, so internal
 * `@earendil-works/*` dependencies inside the packed tarballs and the install
 * lockfile are rewritten to tarball URLs on vega.codes. `npm ci` in managed
 * installs follows lockfile `resolved` URLs; `npm/pnpm/bun i -g <tgz>` follows
 * dependency specs. Third-party dependencies keep resolving from npmjs.
 *
 * With `--layout github` it instead emits a flat asset directory to upload to a
 * GitHub Release: tarballs, installer scripts, `installer-release.json`
 * metadata, and the managed install `package.json`/`package-lock.json`. All
 * URLs point at `https://github.com/<repo>/releases/download/<tag>/<asset>`.
 *
 * Usage:
 *   npm run build                       # required first (dist/ must exist)
 *   node scripts/build-vega-release.mjs [--out .artifacts/vega-site] [--base-url https://vega.codes/pi]
 *   node scripts/build-vega-release.mjs --layout github [--repo lingeniare/pi-vega] [--tag vX.Y.Z]
 *
 * Deploy site layout: rsync -r <out>/ user@host:/var/www/vega.codes/
 * Deploy github layout: gh release upload <tag> <out>/*
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const codingAgentDir = join(repoRoot, "packages", "coding-agent");
const installDir = join(repoRoot, "install");
const INTERNAL_SCOPE = "@earendil-works/";

function parseArgs(argv) {
	const options = { out: undefined, baseUrl: "https://vega.codes/pi", layout: "site", repo: "lingeniare/pi-vega", tag: undefined };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out") {
			options.out = resolve(argv[++index]);
		} else if (arg === "--base-url") {
			options.baseUrl = argv[++index].replace(/\/+$/, "");
		} else if (arg === "--layout") {
			options.layout = argv[++index];
		} else if (arg === "--repo") {
			options.repo = argv[++index];
		} else if (arg === "--tag") {
			options.tag = argv[++index];
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	if (options.layout !== "site" && options.layout !== "github") {
		throw new Error(`Unknown layout: ${options.layout}`);
	}
	return options;
}

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

function run(command, args, options = {}) {
	console.log(`$ ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "inherit", "inherit"], ...options });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} exited with code ${result.status ?? "unknown"}`);
	}
	return result.stdout;
}

// Locate the npm CLI entrypoint so `npm pack` also works outside npm scripts
// and on Windows, where spawning npm.cmd directly fails without a shell.
function npmCliEntrypoint() {
	if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
		return process.env.npm_execpath;
	}
	const candidates = [
		join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
		join(dirname(process.execPath), "lib", "node_modules", "npm", "bin", "npm-cli.js"),
	];
	const found = candidates.find((candidate) => existsSync(candidate));
	if (!found) throw new Error("Cannot locate the npm CLI. Run this script through an npm script.");
	return found;
}

function execNpm(args, options = {}) {
	if (process.platform === "win32") {
		return execFileSync(process.execPath, [npmCliEntrypoint(), ...args], options);
	}
	return execFileSync("npm", args, options);
}

// npm names scoped tarballs "<scope>-<name>-<version>.tgz"; serve them under the
// bare package name for cleaner URLs.
function tarballBasename(packageName, version) {
	const bareName = packageName.startsWith("@") ? packageName.split("/")[1] : packageName;
	return `${bareName}-${version}.tgz`;
}

function sha512Integrity(path) {
	return `sha512-${createHash("sha512").update(readFileSync(path)).digest("base64")}`;
}

// Rewrite @earendil-works/* dependency specs in a manifest to tarball URLs
// produced by depUrl(name).
function rewriteInternalDeps(manifest, depUrl) {
	for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
		const deps = manifest[field];
		if (!deps) continue;
		for (const name of Object.keys(deps)) {
			if (name.startsWith(INTERNAL_SCOPE)) {
				deps[name] = depUrl(name);
			}
		}
	}
	if (manifest.devDependencies) {
		for (const name of Object.keys(manifest.devDependencies)) {
			if (name.startsWith(INTERNAL_SCOPE)) delete manifest.devDependencies[name];
		}
	}
}

// GNU tar parses "C:\..." archive operands as remote host specs on Windows;
// --force-local disables that. bsdtar accepts the flag as a no-op.
const TAR_LOCAL = process.platform === "win32" ? ["--force-local"] : [];

// Unpack a scoped npm tarball, rewrite internal deps to URLs, repack, and
// return the final tarball path plus its integrity hash.
function repackWithUrlDeps(tarballPath, outDir, version, depUrl) {
	const stageDir = mkdtempSync(join(tmpdir(), "pi-vega-repack-"));
	try {
		execFileSync("tar", [...TAR_LOCAL, "-xzf", tarballPath, "-C", stageDir]);
		const manifestPath = join(stageDir, "package", "package.json");
		const manifest = readJson(manifestPath);
		rewriteInternalDeps(manifest, depUrl);
		writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
		const outPath = join(outDir, tarballBasename(manifest.name, version));
		execFileSync("tar", [...TAR_LOCAL, "-czf", outPath, "-C", stageDir, "package"]);
		return { path: outPath, name: manifest.name, integrity: sha512Integrity(outPath) };
	} finally {
		rmSync(stageDir, { force: true, recursive: true });
	}
}

function findInternalPackages(lockPackages, version) {
	const internal = new Map();
	for (const [lockPath, entry] of Object.entries(lockPackages)) {
		const name = entry.name ?? lockPath.slice(lockPath.lastIndexOf("node_modules/") + "node_modules/".length);
		if (!name.startsWith(INTERNAL_SCOPE) || !lockPath.includes("node_modules/")) continue;
		internal.set(name, entry.version ?? version);
	}
	return internal;
}

const options = parseArgs(process.argv.slice(2));
const codingAgentPackage = readJson(join(codingAgentDir, "package.json"));
const version = codingAgentPackage.version;
const layout = options.layout;
const tag = options.tag ?? `v${version}`;
// GitHub Releases serves release assets as flat files, so in the github layout
// dep URLs point straight at the tagged release's download directory.
const downloadBase = `https://github.com/${options.repo}/releases/download/${tag}`;
const depUrl =
	layout === "github"
		? (name) => `${downloadBase}/${tarballBasename(name, version)}`
		: (name) => `${options.baseUrl}/releases/${version}/${tarballBasename(name, version)}`;
const outDir = options.out ?? join(repoRoot, ".artifacts", layout === "github" ? "github-release" : "vega-site");
const siteRoot = join(outDir, "pi");
const releasesDir = layout === "github" ? outDir : join(siteRoot, "releases", version);
const latestDir = join(siteRoot, "releases", "latest");
const apiDir = join(siteRoot, "api");
const apiReleasesDir = join(apiDir, "installer", "releases");

if (!existsSync(join(codingAgentDir, "dist", "bundle", "cli.js"))) {
	console.error("packages/coding-agent/dist/bundle/cli.js is missing. Run `npm run build` first.");
	process.exit(1);
}

// Refresh install-lock/ from the workspace, then transform a copy for serving.
run("node", ["scripts/generate-coding-agent-install-lock.mjs"]);
const installerPackageJson = readJson(join(codingAgentDir, "install-lock", "package.json"));
const installLock = readJson(join(codingAgentDir, "install-lock", "package-lock.json"));

// Pack every internal package referenced by the install lockfile, rewrite its
// internal deps to release tarball URLs, and collect integrity hashes.
const internalPackages = findInternalPackages(installLock.packages, version);
const workspaceDirs = new Map();
for (const dirName of readdirSync(join(repoRoot, "packages"))) {
	const manifestPath = join(repoRoot, "packages", dirName, "package.json");
	if (!existsSync(manifestPath)) continue;
	const manifest = readJson(manifestPath);
	if (manifest.name) workspaceDirs.set(manifest.name, join(repoRoot, "packages", dirName));
}

rmSync(outDir, { force: true, recursive: true });
mkdirSync(releasesDir, { recursive: true });
const packStageDir = mkdtempSync(join(tmpdir(), "pi-vega-pack-"));
const tarballs = new Map();
try {
	for (const [name, pkgVersion] of internalPackages) {
		const dir = workspaceDirs.get(name);
		if (!dir) throw new Error(`No workspace directory found for internal package ${name}`);
		const output = execNpm(["pack", "--ignore-scripts", "--pack-destination", packStageDir], {
			cwd: dir,
			encoding: "utf8",
		});
		const packedFile = output
			.trim()
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.pop();
		if (!packedFile || !existsSync(join(packStageDir, packedFile))) {
			throw new Error(`npm pack did not produce a tarball for ${name}: ${output}`);
		}
		const repacked = repackWithUrlDeps(join(packStageDir, packedFile), releasesDir, version, depUrl);
		tarballs.set(name, repacked);
		console.log(`  packed ${name}@${pkgVersion} -> ${basename(repacked.path)}`);
	}
} finally {
	rmSync(packStageDir, { force: true, recursive: true });
}

// Rewrite the lockfile copy: internal entries resolve to our tarballs and
// internal dep specs match the repacked manifests.
for (const [lockPath, entry] of Object.entries(installLock.packages)) {
	const name = lockPath.includes("node_modules/")
		? lockPath.slice(lockPath.lastIndexOf("node_modules/") + "node_modules/".length)
		: undefined;
	if (name?.startsWith(INTERNAL_SCOPE) && tarballs.has(name)) {
		const tarball = tarballs.get(name);
		entry.resolved = depUrl(name);
		entry.integrity = tarball.integrity;
	}
	// The root entry's dependency map must keep the semver spec: the managed
	// installer requires package.json and the lock root to name the exact version.
	if (lockPath === "") continue;
	for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
		const deps = entry[field];
		if (!deps) continue;
		for (const depName of Object.keys(deps)) {
			if (depName.startsWith(INTERNAL_SCOPE)) {
				deps[depName] = depUrl(depName);
			}
		}
	}
}

const codingAgentTarball = tarballs.get(codingAgentPackage.name);
if (!codingAgentTarball) {
	throw new Error(`Install lockfile does not include ${codingAgentPackage.name}`);
}
const installSpec = depUrl(codingAgentPackage.name);
const latestJson = `${JSON.stringify({ version, installSpec })}\n`;

if (layout === "github") {
	// Flat asset set for `gh release upload`: the installer resolves metadata at
	// releases/latest/download/installer-release.json and managed manifests at
	// releases/download/<tag>/{package.json,package-lock.json}.
	writeFileSync(join(outDir, "installer-release.json"), `${JSON.stringify({ version, packageName: codingAgentPackage.name, installSpec })}\n`);
	writeFileSync(join(outDir, "package.json"), `${JSON.stringify(installerPackageJson, null, "\t")}\n`);
	writeFileSync(join(outDir, "package-lock.json"), `${JSON.stringify(installLock, null, "\t")}\n`);
	for (const tarball of tarballs.values()) {
		const fileName = basename(tarball.path);
		cpSync(tarball.path, join(outDir, fileName.replace(`-${version}.tgz`, "-latest.tgz")));
	}
	for (const scriptName of ["install.sh", "install.ps1"]) {
		cpSync(join(installDir, scriptName), join(outDir, scriptName));
	}
} else {
	// Emit the site tree.
	mkdirSync(apiReleasesDir, { recursive: true });
	mkdirSync(join(apiReleasesDir, version), { recursive: true });
	mkdirSync(latestDir, { recursive: true });

	writeFileSync(join(apiDir, "latest-version"), latestJson);
	writeFileSync(join(apiReleasesDir, "latest"), latestJson);
	writeFileSync(join(apiReleasesDir, version, "package.json"), `${JSON.stringify(installerPackageJson, null, "\t")}\n`);
	writeFileSync(join(apiReleasesDir, version, "package-lock.json"), `${JSON.stringify(installLock, null, "\t")}\n`);

	for (const tarball of tarballs.values()) {
		const fileName = basename(tarball.path);
		const latestName = fileName.replace(`-${version}.tgz`, "-latest.tgz");
		cpSync(tarball.path, join(latestDir, latestName));
	}
	for (const scriptName of ["install.sh", "install.ps1"]) {
		cpSync(join(installDir, scriptName), join(siteRoot, scriptName));
	}
}

// Sanity checks matching the installer's artifact validation.
const piLockEntry = installLock.packages[`node_modules/${codingAgentPackage.name}`];
const checks = [
	[installerPackageJson.dependencies?.[codingAgentPackage.name] === version, "package.json dependency"],
	[installLock.packages[""]?.dependencies?.[codingAgentPackage.name] === version, "lockfile root dependency"],
	[piLockEntry?.version === version, "lockfile package entry version"],
	[installLock.lockfileVersion === 3, "lockfileVersion 3"],
];
for (const [ok, label] of checks) {
	if (!ok) throw new Error(`Generated artifacts failed validation: ${label}`);
}

if (layout === "github") {
	console.log(`\nBuilt GitHub release assets v${version} at ${relative(repoRoot, outDir)}`);
	console.log(`  ${tarballs.size} tarballs, installer scripts and managed manifests`);
	console.log(`\nPublish with e.g.:\n  gh release create ${tag} --repo ${options.repo} ${relative(repoRoot, outDir)}/*`);
} else {
	console.log(`\nBuilt vega.codes release site v${version} at ${relative(repoRoot, outDir)}/pi`);
	console.log(`  ${tarballs.size} tarballs, install endpoints under pi/api`);
	console.log(`\nDeploy with e.g.:\n  rsync -r ${relative(repoRoot, outDir)}/ user@vega.codes:/var/www/vega.codes/`);
	console.log("Serve extensionless files pi/api/latest-version and pi/api/installer/releases/latest as-is (JSON content).");
}
