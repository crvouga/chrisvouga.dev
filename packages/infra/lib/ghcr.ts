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
  for (const value of [
    process.env.GH_TOKEN,
    process.env.GITHUB_TOKEN,
    process.env.GITHUB_TOKEN_SUPER,
    process.env.DEPLOY_DISPATCH_TOKEN,
  ]) {
    const token = value?.trim();
    if (token && !seen.has(token)) {
      seen.add(token);
      tokens.push(token);
    }
  }
  return tokens;
}

export function ghcrToken(): string | undefined {
  return ghcrAuthTokens()[0];
}

export function packageNamesForService(config: ServicesConfig, serviceId: string): readonly string[] {
  return [
    imagePackageName(config, serviceId),
    ...(LEGACY_PACKAGE_NAMES[serviceId] ?? []),
  ];
}

function ghcrVisibilityUrls(owner: string, packageName: string, repoSlug?: string): readonly string[] {
  const urls = [
    `https://api.github.com/user/packages/container/${packageName}/visibility`,
    `https://api.github.com/users/${owner}/packages/container/${packageName}/visibility`,
    `https://api.github.com/orgs/${owner}/packages/container/${packageName}/visibility`,
  ];
  if (repoSlug) {
    urls.push(`https://api.github.com/repos/${repoSlug}/packages/container/${packageName}/visibility`);
  }
  return urls;
}

const GHCR_MANIFEST_ACCEPT =
  "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json";

const GHCR_PUBLIC_PULL_ATTEMPTS = 3;
const GHCR_PUBLIC_PULL_RETRY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isGhcrPubliclyPullableOnce(owner: string, packageName: string): Promise<boolean> {
  const tokenUrl =
    `https://ghcr.io/token?service=ghcr.io&scope=repository:${owner}/${packageName}:pull`;
  const tokenRes = await fetch(tokenUrl);
  if (!tokenRes.ok) return false;

  const tokenPayload = (await tokenRes.json().catch(() => null)) as { token?: string } | null;
  const token = tokenPayload?.token;
  if (!token) return false;

  const manifestRes = await fetch(`https://ghcr.io/v2/${owner}/${packageName}/manifests/latest`, {
    headers: {
      Accept: GHCR_MANIFEST_ACCEPT,
      Authorization: `Bearer ${token}`,
    },
  });
  return manifestRes.ok;
}

/** True when an anonymous pull token can fetch :latest (package is public). Retries briefly for post-push lag. */
async function isGhcrPubliclyPullable(owner: string, packageName: string): Promise<boolean> {
  for (let attempt = 1; attempt <= GHCR_PUBLIC_PULL_ATTEMPTS; attempt++) {
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
  const urls = ghcrVisibilityUrls(owner, packageName, repoSlug);

  if (dryRun) {
    console.log(`  [plan] GHCR public ${owner}/${packageName}`);
    return true;
  }

  const tokens = ghcrAuthTokens();
  if (tokens.length === 0) {
    console.warn(`  skip GHCR public ${packageName}: GH_TOKEN or GITHUB_TOKEN required`);
    return false;
  }

  const errors: string[] = [];
  for (const [tokenIndex, token] of tokens.entries()) {
    for (const url of urls) {
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
  const repoSlug = infraGithubRepo(config);
  for (const packageName of packageNamesForService(config, serviceId)) {
    await setGhcrPackagePublic(config.image_owner, packageName, dryRun, repoSlug);
  }
}
