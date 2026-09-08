import { assert } from "@pkgs/assert";
import { ghcrToken } from "./ghcr.js";
import { updateServiceInstance } from "./railway-api.js";
import { loadServicesConfig } from "./services.js";

/** GHCR docker login username for PAT auth (GitHub username / org owner). */
export function ghcrRegistryUsername(): string {
  const username = loadServicesConfig().image_owner;
  assert.nonEmptyString(username, "services.yaml image_owner must be non-empty");
  return username;
}

export function ghcrRegistryPassword(): string | undefined {
  const password = ghcrToken();
  assert.ok(password === undefined || password.length > 0, "ghcr password must be undefined or non-empty");
  return password;
}

/**
 * Configure Railway to pull private GHCR images. No-op when no token is available.
 * Public packages do not require this, but setting credentials is harmless.
 */
export async function ensureRailwayGhcrPullCredentials(input: {
  readonly serviceId: string;
  readonly environmentId: string;
}): Promise<boolean> {
  assert.record(input, "ghcr pull credentials input must be a record");
  assert.nonEmptyString(input.serviceId, "service id must be non-empty");
  assert.nonEmptyString(input.environmentId, "environment id must be non-empty");
  const password = ghcrRegistryPassword();
  if (!password) {
    console.warn("  GHCR registry credentials skipped (GH_TOKEN or GITHUB_TOKEN_SUPER required)");
    return false;
  }
  assert.nonEmptyString(password, "ghcr password must be non-empty after friendly check");

  try {
    await updateServiceInstance({
      serviceId: input.serviceId,
      environmentId: input.environmentId,
      registryCredentials: {
        username: ghcrRegistryUsername(),
        password,
      },
    });
    console.log("  Railway GHCR registry credentials configured");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Private registry credentials can only be set for Pro users")) {
      console.warn(
        "  Railway GHCR registry credentials skipped (Pro plan required — publish public GHCR images instead)",
      );
      return false;
    }
    throw err;
  }
}
