import { assert, hotAssert, type Assert } from "@pkgs/assert";

const ha: Assert = hotAssert();
import {
  imagePackageName,
  infraGithubRepo,
  loadServicesConfig,
  type ServicesConfig,
} from "./services.js";

/** Pre-migration package names still on GHCR. */
const LEGACY_PACKAGE_NAMES: Readonly<Record<string, readonly string[]>> = {};

export function ghcrAuthTokens(): readonly string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  const candidates = [
    process.env.GH_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.GITHUB_TOKEN_SUPER,
    process.env.DEPLOY_DISPATCH_TOKEN,
  ];
  assert.array(candidates, "ghcr token candidates must be an array");
  for (const value of candidates) {
    const token = value?.trim();
    if (token && !seen.has(token)) {
      ha.nonEmptyString(token, "ghcr auth token must be non-empty");
      seen.add(token);
      tokens.push(token);
    }
  }
  assert.array(tokens, "ghcr auth tokens must be an array");
  return tokens;
}

export function ghcrToken(): string | undefined {
  const token = ghcrAuthTokens()[0];
  assert.ok(token === undefined || token.length > 0, "ghcr token must be undefined or non-empty");
  return token;
}

export function packageNamesForService(config: ServicesConfig, serviceId: string): readonly string[] {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(serviceId, "service id must be non-empty");
  const names = [
    imagePackageName(config, serviceId),
    ...(LEGACY_PACKAGE_NAMES[serviceId] ?? []),
  ];
  assert.nonEmptyArray(names, "package names must be non-empty");
  return names;
}

function ghcrVisibilityUrls(owner: string, packageName: string, repoSlug?: string): readonly string[] {
  assert.nonEmptyString(owner, "ghcr owner must be non-empty");
  assert.nonEmptyString(packageName, "ghcr package name must be non-empty");
  if (repoSlug !== undefined) assert.nonEmptyString(repoSlug, "ghcr repo slug must be non-empty");
  const urls = [
    `https://api.github.com/user/packages/container/${packageName}/visibility`,
    `https://api.github.com/users/${owner}/packages/container/${packageName}/visibility`,
    `https://api.github.com/orgs/${owner}/packages/container/${packageName}/visibility`,
  ];
  if (repoSlug) {
    urls.push(`https://api.github.com/repos/${repoSlug}/packages/container/${packageName}/visibility`);
  }
  assert.nonEmptyArray(urls, "ghcr visibility urls must be non-empty");
  assert.ok(
    urls.every((u) => u.startsWith("https://")),
    "ghcr visibility urls must be https",
  );
  return urls;
}

const GHCR_MANIFEST_ACCEPT =
  "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json";

const GHCR_PUBLIC_PULL_ATTEMPTS = 3;
const GHCR_PUBLIC_PULL_RETRY_MS = 1500;

function sleep(ms: number): Promise<void> {
  assert.nonNegative(ms, "sleep ms must be non-negative");
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isGhcrPubliclyPullableOnce(owner: string, packageName: string): Promise<boolean> {
  assert.nonEmptyString(owner, "ghcr owner must be non-empty");
  assert.nonEmptyString(packageName, "ghcr package name must be non-empty");
  const tokenUrl =
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${owner}/${packageName}:pull`;
  assert.ok(tokenUrl.startsWith("https://"), "ghcr token url must be https");
  const tokenRes = await fetch(tokenUrl);
  assert.ok(tokenRes instanceof Response, "ghcr token fetch must return a Response");
  if (!tokenRes.ok) return false;

  const tokenPayload = (await tokenRes.json().catch(() => null)) as { token?: string } | null;
  if (tokenPayload !== null) assert.record(tokenPayload, "ghcr token payload must be a record");
  const token = tokenPayload?.token;
  if (typeof token !== "string" || token.length === 0) return false;

  const manifestRes = await fetch(`https://ghcr.io/v2/${owner}/${packageName}/manifests/latest`, {
    headers: {
      Accept: GHCR_MANIFEST_ACCEPT,
      Authorization: `Bearer ${token}`,
    },
  });
  assert.ok(manifestRes instanceof Response, "ghcr manifest fetch must return a Response");
  return manifestRes.ok;
}

/** True when an anonymous pull token can fetch :latest (package is public). Retries briefly for post-push lag. */
async function isGhcrPubliclyPullable(owner: string, packageName: string): Promise<boolean> {
  assert.nonEmptyString(owner, "ghcr owner must be non-empty");
  assert.nonEmptyString(packageName, "ghcr package name must be non-empty");
  for (let attempt = 1; attempt <= GHCR_PUBLIC_PULL_ATTEMPTS; attempt++) {
    ha.ok(attempt >= 1, "ghcr pull attempt must be >= 1", { attempt });
    if (await isGhcrPubliclyPullableOnce(owner, packageName)) return true;
    if (attempt < GHCR_PUBLIC_PULL_ATTEMPTS) await sleep(GHCR_PUBLIC_PULL_RETRY_MS);
  }
  return false;
}

export async function setGhcrPackagePublic(
  owner: string,
  packageName: string,
  dryRun = false,
  repoSlug?: string,
): Promise<boolean> {
  assert.nonEmptyString(owner, "ghcr owner must be non-empty");
  assert.nonEmptyString(packageName, "ghcr package name must be non-empty");
  assert.ok(typeof dryRun === "boolean", "dryRun must be a boolean");
  if (repoSlug !== undefined) assert.nonEmptyString(repoSlug, "ghcr repo slug must be non-empty");
  const urls = ghcrVisibilityUrls(owner, packageName, repoSlug);
  assert.nonEmptyArray(urls, "ghcr visibility urls must be non-empty");

  if (dryRun) {
    console.log(`  [plan] GHCR public ${owner}/${packageName}`);
    return true;
  }

  const tokens = ghcrAuthTokens();
  assert.array(tokens, "ghcr auth tokens must be an array");
  if (tokens.length === 0) {
    console.warn(`  skip GHCR public ${packageName}: GH_TOKEN or GITHUB_TOKEN required`);
    return false;
  }

  const errors: string[] = [];
  for (const [tokenIndex, token] of tokens.entries()) {
    ha.nonEmptyString(token, "ghcr auth token must be non-empty");
    for (const url of urls) {
      ha.ok(url.startsWith("https://"), "ghcr visibility url must be https", { url });
      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visibility: "public" }),
      });
      if (res.status === 404) {
        errors.push(`token ${tokenIndex + 1}: 404 at ${url}`);
        continue;
      }
      if (res.ok) {
        console.log(`  GHCR public ${owner}/${packageName} (${url})`);
        return true;
      }
      const text = await res.text();
      errors.push(`token ${tokenIndex + 1}: HTTP ${res.status} at ${url}: ${text.slice(0, 200)}`);
    }
  }

  if (await isGhcrPubliclyPullable(owner, packageName)) {
    console.log(`  GHCR public ${owner}/${packageName} (verified by anonymous pull token)`);
    return true;
  }

  console.warn(`  skip GHCR public ${packageName}: ${errors.join("; ")}`);
  return false;
}

export async function ensureGhcrPackagePublic(
  config: ServicesConfig,
  serviceId: string,
  dryRun = false,
): Promise<void> {
  assert.record(config, "services config must be a record");
  assert.nonEmptyString(serviceId, "service id must be non-empty");
  assert.ok(typeof dryRun === "boolean", "dryRun must be a boolean");
  const repoSlug = infraGithubRepo(config);
  const packageNames = packageNamesForService(config, serviceId);
  assert.nonEmptyArray(packageNames, "package names must be non-empty");
  for (const packageName of packageNames) {
    ha.nonEmptyString(packageName, "ghcr package name must be non-empty");
    await setGhcrPackagePublic(config.image_owner, packageName, dryRun, repoSlug);
  }
}
