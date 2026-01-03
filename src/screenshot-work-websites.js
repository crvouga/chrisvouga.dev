// @ts-check
import { execSync } from "child_process";
import { chromium } from "playwright";
import path from "path";
import { WORK } from "./content/work.js";

/**
 * The directory to save screenshots.
 * @type {string}
 */
const PUBLIC_DIR = "./public";

/**
 * The width to which the PNG images will be resized during optimization.
 * @type {number}
 */
const OPTIMIZATION_WIDTH = 600;

/**
 * Viewport dimensions for screenshots (16:9 aspect ratio).
 * @type {{ width: number; height: number }}
 */
const VIEWPORT = { width: 1920, height: 1080 };

/**
 * Converts a company name to a filename-safe string.
 * @param {string} name - The company name.
 * @returns {string} The filename-safe string.
 */
const nameToFilename = (name) => {
  return name.toLowerCase().replace(/\s+/g, "-");
};

/**
 * Takes a screenshot of a website and saves it to the public directory.
 * @param {string} url - The URL to screenshot.
 * @param {string} filename - The filename (without extension) to save the screenshot as.
 * @returns {Promise<void>}
 */
const takeScreenshot = async (url, filename) => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Set viewport before navigating for proper rendering
    await page.setViewportSize(VIEWPORT);
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000); // Wait for any animations/transitions

    const screenshotPath = path.join(PUBLIC_DIR, `${filename}.png`);
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
 * Optimizes an image using sharp-cli.
 * @param {string} inputPath - The path to the input image.
 * @param {string} outputPath - The path to save the optimized image.
 * @returns {void}
 */
const optimizeImage = (inputPath, outputPath) => {
  const command = `npx --yes sharp-cli resize --input "${inputPath}" --output "${outputPath}" --width ${OPTIMIZATION_WIDTH}`;
  console.log(`Optimizing: ${command}`);
  execSync(command);
};

/**
 * Main function to screenshot all work websites.
 * @returns {Promise<void>}
 */
const main = async () => {
  console.log("Starting screenshot capture for work websites...\n");

  // Filter work entries that have infoUrl
  const workEntriesWithUrl = WORK.filter((work) => work.infoUrl);

  if (workEntriesWithUrl.length === 0) {
    console.log("No work entries with infoUrl found.");
    return;
  }

  console.log(`Found ${workEntriesWithUrl.length} work entr${workEntriesWithUrl.length === 1 ? "y" : "ies"} with URLs.\n`);

  for (const work of workEntriesWithUrl) {
    const filename = nameToFilename(work.name);
    const url = work.infoUrl;

    if (!url) {
      console.log(`Skipping ${work.name}: no infoUrl`);
      continue;
    }

    try {
      console.log(`\nProcessing: ${work.name}`);
      console.log(`URL: ${url}`);
      console.log(`Filename: ${filename}.png`);

      // Take screenshot
      const screenshotPath = await takeScreenshot(url, filename);
      console.log(`✓ Screenshot saved: ${screenshotPath}`);

      // Optimize image
      const optimizedPath = path.join(
        PUBLIC_DIR,
        `${filename}.optimized.webp`
      );
      optimizeImage(screenshotPath, optimizedPath);
      console.log(`✓ Optimized image saved: ${optimizedPath}`);
    } catch (error) {
      console.error(`✗ Failed to process ${work.name}:`, error.message);
      console.error(`  Continuing with next entry...\n`);
    }
  }

  console.log("\n✓ Screenshot capture complete!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

