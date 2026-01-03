// @ts-check
import { chromium } from "playwright";
import path from "path";
import { mkdir } from "fs/promises";
import { PROJECTS } from "./content/project.js";

/**
 * The directory to save screenshots.
 * @type {string}
 */
const PUBLIC_DIR = path.resolve("./public");

/**
 * Viewport dimensions for screenshots (16:9 aspect ratio).
 * @type {{ width: number; height: number }}
 */
const VIEWPORT = { width: 1920, height: 1080 };

/**
 * Converts a project title to a filename-safe string.
 * @param {string} title - The project title.
 * @returns {string} The filename-safe string.
 */
const titleToFilename = (title) => {
  return title
    .toLowerCase()
    .replace(/\./g, "-") // Replace dots with hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, "-") // Replace special chars with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
};

/**
 * Takes a screenshot of a website and saves it to the public directory.
 * @param {string} url - The URL to screenshot.
 * @param {string} filename - The filename (without extension) to save the screenshot as.
 * @returns {Promise<string>} The path to the saved screenshot.
 */
const takeScreenshot = async (url, filename) => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "dark", // Force dark mode
  });
  const page = await context.newPage();

  try {
    // Set dark mode preference
    await page.emulateMedia({ colorScheme: "dark" });

    console.log(`Navigating to ${url}...`);
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Check if response is successful (status 200-299)
    if (!response) {
      throw new Error("No response received from server");
    }

    const status = response.status();
    if (status < 200 || status >= 300) {
      throw new Error(
        `HTTP ${status} error: Server returned non-success status code`
      );
    }

    await page.waitForTimeout(2000); // Wait for any animations/transitions

    const screenshotPath = path.join(PUBLIC_DIR, `${filename}-screenshot.png`);
    console.log(`Taking screenshot: ${screenshotPath}`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    await browser.close();
    return screenshotPath;
  } catch (error) {
    await browser.close();
    throw error;
  }
};

/**
 * Main function to screenshot all project websites.
 * @returns {Promise<void>}
 */
const main = async () => {
  console.log("Starting screenshot capture for project websites...\n");

  // Ensure public directory exists
  await mkdir(PUBLIC_DIR, { recursive: true });

  // Filter projects with public deployments
  const projectsWithPublicDeployment = PROJECTS.filter(
    (project) => project.deployment.t === "public"
  );

  if (projectsWithPublicDeployment.length === 0) {
    console.log("No projects with public deployments found.");
    return;
  }

  console.log(
    `Found ${projectsWithPublicDeployment.length} project${
      projectsWithPublicDeployment.length === 1 ? "" : "s"
    } with public deployments.\n`
  );

  for (const project of projectsWithPublicDeployment) {
    const filename = titleToFilename(project.title);
    const url =
      project.deployment.t === "public" ? project.deployment.url : null;

    if (!url) {
      console.log(`Skipping ${project.title}: no deployment URL`);
      continue;
    }

    try {
      console.log(`\nProcessing: ${project.title}`);
      console.log(`URL: ${url}`);
      console.log(`Filename: ${filename}-screenshot.png`);

      // Take screenshot
      const screenshotPath = await takeScreenshot(url, filename);
      console.log(`✓ Screenshot saved: ${screenshotPath}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`✗ Failed to process ${project.title}:`, errorMessage);
      console.error(`  Continuing with next project...\n`);
    }
  }

  console.log("\n✓ Screenshot capture complete!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
