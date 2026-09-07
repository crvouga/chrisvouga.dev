#!/usr/bin/env bun
/**
 * Destroy DigitalOcean droplet and purge NODE_SSH_* from Vault.
 *
 * Usage:
 *   bun run scripts/destroy-digitalocean.ts
 *   bun run scripts/destroy-digitalocean.ts --name origin --apply
 */
import { vaultKvDeleteKeysApi } from "../lib/vault-kv.js";
import { loadServicesConfig } from "../lib/services.js";

const DO_API = "https://api.digitalocean.com/v2";
const DEFAULT_DROPLET = "origin";
const DEFAULT_PROJECT = "projects";
const NODE_SSH_KEYS = ["NODE_SSH_HOST", "NODE_SSH_USER", "NODE_SSH_KEY"] as const;

type Args = {
  readonly name: string;
  readonly apply: boolean;
  readonly purgeVault: boolean;
  readonly projectName: string;
};

type Droplet = {
  id: number;
  name: string;
  status: string;
};

type DoProject = {
  id: string;
  name: string;
};

function parseArgs(argv: readonly string[]): Args {
  let name = DEFAULT_DROPLET;
  let apply = false;
  let purgeVault = true;
  let projectName = DEFAULT_PROJECT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--name") name = argv[++i] ?? name;
    else if (arg === "--project") projectName = argv[++i] ?? projectName;
    else if (arg === "--apply") apply = true;
    else if (arg === "--no-vault-purge") purgeVault = false;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/destroy-digitalocean.ts [--name origin] [--project projects] [--apply] [--no-vault-purge]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { name, apply, purgeVault, projectName };
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function doFetch<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${DO_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DO API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function findDropletByName(token: string, name: string): Promise<Droplet | null> {
  const data = await doFetch<{ droplets: Droplet[] }>(
    token,
    "GET",
    `/droplets?name=${encodeURIComponent(name)}`,
  );
  return data.droplets.find((d) => d.name === name) ?? null;
}

async function findDoProject(token: string, name: string): Promise<DoProject | null> {
  let page = 1;
  while (true) {
    const data = await doFetch<{ projects: DoProject[]; links?: { pages?: { next?: string } } }>(
      token,
      "GET",
      `/projects?page=${page}&per_page=200`,
    );
    const match = data.projects.find((p) => p.name === name);
    if (match) return match;
    if (!data.links?.pages?.next) return null;
    page += 1;
  }
}

async function powerOffDroplet(token: string, id: number): Promise<void> {
  await doFetch(token, "POST", `/droplets/${id}/actions`, { type: "power_off" });
}

async function waitForDropletOff(token: string, id: number): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const data = await doFetch<{ droplet: Droplet }>(token, "GET", `/droplets/${id}`);
    if (data.droplet.status === "off") return;
    await Bun.sleep(5_000);
  }
  throw new Error(`Droplet ${id} did not power off in time`);
}

async function deleteDroplet(token: string, id: number): Promise<void> {
  await doFetch(token, "DELETE", `/droplets/${id}`);
}

async function removeFromProject(token: string, projectId: string, dropletId: number): Promise<void> {
  await doFetch(token, "DELETE", `/projects/${projectId}/resources`, {
    resources: [`do:droplet:${dropletId}`],
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadServicesConfig();
  const token = requireEnv("DIGITALOCEAN_TOKEN");

  console.log(`Destroy DO droplet "${args.name}" (${args.apply ? "APPLY" : "DRY-RUN"})`);

  const droplet = await findDropletByName(token, args.name);
  if (!droplet) {
    console.log(`Droplet "${args.name}" not found — nothing to delete`);
  } else {
    console.log(`Found droplet id=${droplet.id} status=${droplet.status}`);
    if (!args.apply) {
      console.log(`[plan] power_off + delete droplet ${droplet.id}`);
    } else {
      if (droplet.status !== "off") {
        console.log("Powering off...");
        await powerOffDroplet(token, droplet.id);
        await waitForDropletOff(token, droplet.id);
      }
      const project = await findDoProject(token, args.projectName);
      if (project) {
        try {
          await removeFromProject(token, project.id, droplet.id);
          console.log(`Removed from DO project "${args.projectName}"`);
        } catch (err) {
          console.warn(`Could not remove from project: ${err instanceof Error ? err.message : err}`);
        }
      }
      console.log("Deleting droplet...");
      await deleteDroplet(token, droplet.id);
      console.log("Droplet deleted");
    }
  }

  if (args.purgeVault) {
    if (!args.apply) {
      console.log(`[plan] Purge Vault keys: ${NODE_SSH_KEYS.join(", ")}`);
    } else if (process.env.VAULT_TOKEN?.trim()) {
      for (const path of ["secret/data/personal/prd", "secret/data/personal/dev"] as const) {
        try {
          await vaultKvDeleteKeysApi(NODE_SSH_KEYS, path);
          console.log(`Purged NODE_SSH_* from ${path}`);
        } catch (err) {
          console.warn(`${path}: ${err instanceof Error ? err.message : err}`);
        }
      }
    } else {
      console.warn("VAULT_TOKEN not set — skipping Vault NODE_SSH_* purge");
    }
  }

  console.log("\nDone");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
