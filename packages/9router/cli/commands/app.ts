import { existsSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR, REPO_BRANCH, REPO_URL } from "../../scripts/lib/paths.ts";
import { requireCmd, runInherit } from "../../scripts/lib/spawn.ts";
import { patchOAuthRedirect } from "../../scripts/oauth-redirect-patch.ts";
import { CommandError, type Command } from "../types.ts";

export async function syncApp(): Promise<void> {
  requireCmd("git");

  if (existsSync(join(APP_DIR, ".git"))) {
    console.log(`==> Updating ${APP_DIR} (${REPO_BRANCH})...`);
    runInherit("git", ["-C", APP_DIR, "fetch", "origin"]);
    runInherit("git", ["-C", APP_DIR, "checkout", REPO_BRANCH]);
    runInherit("git", [
      "-C",
      APP_DIR,
      "pull",
      "--ff-only",
      "origin",
      REPO_BRANCH,
    ]);
  } else {
    if (existsSync(APP_DIR)) {
      throw new CommandError(
        `${APP_DIR} exists but is not a git repo. Remove it and retry.`,
      );
    }
    console.log(`==> Cloning ${REPO_URL} → ${APP_DIR} (${REPO_BRANCH})...`);
    runInherit("git", [
      "clone",
      "--branch",
      REPO_BRANCH,
      "--single-branch",
      REPO_URL,
      APP_DIR,
    ]);
  }

  console.log(`Done. App at ${APP_DIR}`);
}

export async function installApp(): Promise<void> {
  requireCmd("npm");
  if (!existsSync(join(APP_DIR, "package.json"))) {
    throw new CommandError("App not cloned. Run App: Sync first.");
  }
  console.log(`==> npm install in ${APP_DIR}`);
  runInherit("npm", ["install"], { cwd: APP_DIR });
  console.log("Done.");
}

export async function buildApp(): Promise<void> {
  requireCmd("npm");
  requireCmd("node");
  if (!existsSync(join(APP_DIR, "package.json"))) {
    throw new CommandError("App not cloned. Run App: Sync first.");
  }
  console.log(`==> npm run build in ${APP_DIR}`);
  runInherit("npm", ["run", "build"], { cwd: APP_DIR });
  const nextDir = join(APP_DIR, ".next");
  console.log(`==> Applying OAuth redirect patch to ${nextDir}`);
  patchOAuthRedirect(nextDir);
  console.log("Done.");
}

export const appCommands: Command[] = [
  {
    id: "sync-app",
    name: "App: Sync",
    description: "Clone or update upstream 9Router into app/",
    run: syncApp,
  },
  {
    id: "install-app",
    name: "App: Install deps",
    description: "Run npm install in the app/ clone",
    run: installApp,
  },
  {
    id: "build",
    name: "App: Build",
    description: "Build the app and apply the OAuth redirect patch",
    run: buildApp,
  },
];
