#!/usr/bin/env bun
/**
 * Mint a Vault write token and store it as the VAULT_TOKEN GitHub repo secret.
 *
 * OIDC (github-actions role) is read-only (ci-read). This script mints a write token
 * for CI operations that need patch access to secret/data/personal/prd.
 *
 * Prerequisites:
 *   - vault CLI authenticated with admin (or policy write + token create)
 *   - gh CLI authenticated (gh auth login)
 *
 * Usage:
 *   bun run seed-vault-github-secret
 *   bun run seed-vault-github-secret -- --dry-run
 *   bun run seed-vault-github-secret -- --repo crvouga/chrisvouga.dev
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";
import { assert } from "@pkgs/assert";
import {
  resolveVaultAddr,
} from "../lib/vault-kv.js";
import { infraGithubRepo, loadServicesConfig, vaultAddr } from "../lib/services.js";
const POLICY_NAME = "ci-write";
const GH_SECRET_NAME = "VAULT_TOKEN";
const KV_PATH = "secret/data/personal/prd";

const CI_WRITE_POLICY = `# CI write access for GitHub Actions (node SSH credential updates).
path "secret/data/personal/prd" {
  capabilities = ["create", "update", "patch", "read"]
}
`;

type Args = {
  dryRun: boolean;
  repo: string;
  vaultAddr: string;
  tokenPeriod: string;
};

function parseArgs(argv: readonly string[]): Args {
  assert.ok(Array.isArray(argv), "seed argv must be an array");
  let dryRun = false;
  let repo = infraGithubRepo(loadServicesConfig());
  let vaultAddrArg = resolveVaultAddr(vaultAddr(loadServicesConfig()));
  let tokenPeriod = "768h";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--repo") {
      const next = argv[++i];
      assert.ok(
        next === undefined || typeof next === "string",
        "seed --repo value must be a string when present",
      );
      repo = next ?? repo;
    } else if (arg === "--vault-addr") {
      const next = argv[++i];
      assert.ok(
        next === undefined || typeof next === "string",
        "seed --vault-addr value must be a string when present",
      );
      vaultAddrArg = resolveVaultAddr(next);
    } else if (arg === "--period") {
      const next = argv[++i];
      assert.ok(
        next === undefined || typeof next === "string",
        "seed --period value must be a string when present",
      );
      tokenPeriod = next ?? tokenPeriod;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/seed-vault-github-secret.ts [--dry-run] [--repo owner/name] [--period 768h]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  const result = { dryRun, repo, vaultAddr: vaultAddrArg, tokenPeriod };
  assert.ok(typeof result.dryRun === "boolean", "seed dryRun must be a boolean");
  assert.nonEmptyString(result.repo, "seed repo must be non-empty");
  assert.nonEmptyString(result.vaultAddr, "seed vault addr must be non-empty");
  assert.nonEmptyString(result.tokenPeriod, "seed token period must be non-empty");
  return result;
}

async function requireVaultAuth(vaultAddr: string): Promise<void> {
  assert.nonEmptyString(vaultAddr, "seed vault addr must be non-empty");
  process.env.VAULT_ADDR = vaultAddr;
  const lookup = await $`vault token lookup -format=json`.quiet().nothrow();
  if (lookup.exitCode !== 0) {
    throw new Error(
      `Not authenticated to Vault at ${vaultAddr}. Run:\n  VAULT_ADDR=${vaultAddr} vault login -method=userpass username=crvouga`,
    );
  }
  const info = JSON.parse(lookup.stdout.toString()) as { data?: { policies?: string[] } };
  assert.record(info, "vault token lookup must be a record");
  assert.ok(
    info.data === undefined || typeof info.data === "object",
    "vault token lookup data must be an object when present",
  );
  const policies = info.data?.policies ?? [];
  assert.array(policies, "vault token policies must be an array");
  if (!policies.includes("admin") && !policies.includes("root")) {
    throw new Error(
      `Vault token needs admin policy to create ci-write policy and mint tokens (have: ${policies.join(", ")})`,
    );
  }
}

async function ensureCiWritePolicy(dryRun: boolean): Promise<void> {
  assert.ok(typeof dryRun === "boolean", "seed dryRun must be a boolean");
  assert.nonEmptyString(POLICY_NAME, "seed policy name must be non-empty");
  const existing = await $`vault policy read ${POLICY_NAME}`.quiet().nothrow();
  if (existing.exitCode === 0) {
    console.log(`Vault policy "${POLICY_NAME}" already exists`);
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] Would create Vault policy "${POLICY_NAME}"`);
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "vault-policy-"));
  const policyPath = join(dir, `${POLICY_NAME}.hcl`);
  try {
    writeFileSync(policyPath, CI_WRITE_POLICY, "utf8");
    await $`vault policy write ${POLICY_NAME} ${policyPath}`.quiet();
    console.log(`Created Vault policy "${POLICY_NAME}"`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function mintWriteToken(period: string, dryRun: boolean): Promise<string> {
  assert.nonEmptyString(period, "seed token period must be non-empty");
  assert.ok(typeof dryRun === "boolean", "seed dryRun must be a boolean");
  if (dryRun) {
    console.log(`[dry-run] Would mint orphan token with policy=${POLICY_NAME} period=${period}`);
    return "dry-run-token";
  }

  const created = await $`vault token create -policy=${POLICY_NAME} -period=${period} -orphan -format=json`.quiet();
  const body = JSON.parse(created.stdout.toString()) as { auth?: { client_token?: string } };
  assert.record(body, "vault token create must be a record");
  assert.ok(
    body.auth === undefined || typeof body.auth === "object",
    "vault token create auth must be an object when present",
  );
  const token = body.auth?.client_token?.trim();
  if (!token) throw new Error("Vault did not return a client_token");
  assert.nonEmptyString(token, "minted vault token must be non-empty after friendly check");
  return token;
}

async function verifyPatch(vaultAddr: string, token: string, dryRun: boolean): Promise<void> {
  assert.nonEmptyString(vaultAddr, "seed vault addr must be non-empty");
  assert.nonEmptyString(token, "seed vault token must be non-empty");
  assert.ok(typeof dryRun === "boolean", "seed dryRun must be a boolean");
  assert.nonEmptyString(KV_PATH, "seed kv path must be non-empty");
  if (dryRun) {
    console.log("[dry-run] Would verify token can PATCH secret/data/personal/prd");
    return;
  }

  const res = await fetch(`${vaultAddr}/v1/${KV_PATH}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/merge-patch+json",
    },
    body: JSON.stringify({
      data: { __seed_vault_github_secret_probe: new Date().toISOString() },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token verification PATCH failed (${res.status}): ${text}`);
  }

  const cleanup = await fetch(`${vaultAddr}/v1/${KV_PATH}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/merge-patch+json",
    },
    body: JSON.stringify({ data: { __seed_vault_github_secret_probe: null } }),
  });
  if (!cleanup.ok) {
    console.warn("Warning: could not remove verification probe key from Vault");
  }
  console.log("Verified token can PATCH secret/data/personal/prd");
}

async function setGithubSecret(repo: string, token: string, dryRun: boolean): Promise<void> {
  assert.nonEmptyString(repo, "seed repo must be non-empty");
  assert.nonEmptyString(token, "seed github secret token must be non-empty");
  assert.ok(typeof dryRun === "boolean", "seed dryRun must be a boolean");
  assert.nonEmptyString(GH_SECRET_NAME, "seed github secret name must be non-empty");
  if (dryRun) {
    console.log(`[dry-run] Would set GitHub secret ${GH_SECRET_NAME} on ${repo}`);
    return;
  }

  const gh = await $`gh auth status`.quiet().nothrow();
  if (gh.exitCode !== 0) {
    throw new Error("gh CLI not authenticated. Run: gh auth login");
  }

  await $`gh secret set ${GH_SECRET_NAME} --repo ${repo} --body ${token}`.quiet();
  console.log(`Set GitHub secret ${GH_SECRET_NAME} on ${repo}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assert.defined(args, "seed args must be defined");
  console.log(`Vault: ${args.vaultAddr}`);
  console.log(`GitHub repo: ${args.repo}`);

  await requireVaultAuth(args.vaultAddr);
  await ensureCiWritePolicy(args.dryRun);
  const token = await mintWriteToken(args.tokenPeriod, args.dryRun);
  assert.nonEmptyString(token, "seed vault write token must be non-empty");
  await verifyPatch(args.vaultAddr, token, args.dryRun);
  await setGithubSecret(args.repo, token, args.dryRun);

  console.log("Done. Deploy pipeline loads secrets from Vault via OIDC; this GitHub secret is optional.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
