import { chromium } from "playwright";
import path from "path";
import { mkdir } from "fs/promises";
import { CONTENT } from "./content/content";

const PUBLIC_DIR = path.resolve("./public");

const VIEWPORT = { width: 1920, height: 1080 };

const takeScreenshot = async (url: string, filename: string): Promise<string> => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  try {
    await page.emulateMedia({ colorScheme: "dark" });

    console.log(`Navigating to ${url}...`);
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    if (!response) {
      throw new Error("No response received from server");
    }

    const status = response.status();
    if (status < 200 || status >= 300) {
      throw new Error(
        `HTTP ${status} error: Server returned non-success status code`
      );
    }

    await page.waitForTimeout(2000);

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

const main = async (): Promise<void> => {
  console.log("Starting screenshot capture for main site...\n");

  await mkdir(PUBLIC_DIR, { recursive: true });

  const url = CONTENT.SITE_URL;
  const filename = "main-site";

  try {
    console.log(`\nProcessing: Main Site`);
    console.log(`URL: ${url}`);
    console.log(`Filename: ${filename}-screenshot.png`);

    const screenshotPath = await takeScreenshot(url, filename);
    console.log(`✓ Screenshot saved: ${screenshotPath}`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(`✗ Failed to process main site:`, errorMessage);
    throw error;
  }

  console.log("\n✓ Screenshot capture complete!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
