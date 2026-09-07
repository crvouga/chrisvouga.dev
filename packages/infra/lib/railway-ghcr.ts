import { ghcrToken } from "./ghcr.js";
import { updateServiceInstance } from "./railway-api.js";
import { loadServicesConfig } from "./services.js";

/** GHCR docker login username for PAT auth (GitHub username / org owner). */
export function ghcrRegistryUsername(): string {
  return loadServicesConfig().image_owner;
}

export function ghcrRegistryPassword(): string | undefined {
  return ghcrToken();
}

/**
 * Configure Railway to pull private GHCR images. No-op when no token is available.
 * Public packages do not require this, but setting credentials is harmless.
 */
export async function ensureRailwayGhcrPullCredentials(input: {
  readonly serviceId: string;
  readonly environmentId: string;
}): Promise<boolean> {
  const password = ghcrRegistryPassword();
  if (!password) {
    console.warn("  GHCR registry credentials skipped (GH_TOKEN or GITHUB_TOKEN_SUPER required)");
    return false;
  }

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
