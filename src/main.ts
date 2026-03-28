// @ts-check
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { viewApp } from "./app.js";
import { copyDirectory, deleteDirectory } from "./library/file-system.js";
import { render } from "./library/html/render.js";

const PUBLIC_PATH = "./public";
const DIST_PATH = "./dist";

/**
 * Builds the app by generating index.html and copying public files.
 * @returns {Promise<void>}
 */
export const main = async () => {
  console.log("Building...");
  const start = Date.now();
  await deleteDirectory(DIST_PATH);
  await mkdir(DIST_PATH, { recursive: true });
  const elem = viewApp();
  const html = render(elem);
  const indexPath = join(DIST_PATH, "index.html");
  await writeFile(indexPath, html, "utf8");
  await copyDirectory(PUBLIC_PATH, DIST_PATH);
  const end = Date.now();
  const seconds = ((end - start) / 1000).toFixed(2);
  console.log(`Built in ${seconds} seconds`);
};

main().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
