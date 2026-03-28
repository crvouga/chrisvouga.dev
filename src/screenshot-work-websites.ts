import { chromium } from "playwright";
import path from "path";
import { mkdir } from "fs/promises";
import { WORK } from "./content/work";

const PUBLIC_DIR = path.resolve("./public");

const VIEWPORT = { width: 1920, height: 1080 };

const nameToFilename = (name: string): string => {
  return name.toLowerCase().replace(/\s+/g, "-");
};

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
  console.log("Starting screenshot capture for work websites...\n");

  await mkdir(PUBLIC_DIR, { recursive: true });

  const workEntriesWithUrl = WORK.filter((work) => work.infoUrl);

  if (workEntriesWithUrl.length === 0) {
    console.log("No work entries with infoUrl found.");
    return;
  }

  console.log(
    `Found ${workEntriesWithUrl.length} work entr${
      workEntriesWithUrl.length === 1 ? "y" : "ies"
    } with URLs.\n`
  );

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
      console.log(`Filename: ${filename}-screenshot.png`);

      const screenshotPath = await takeScreenshot(url, filename);
      console.log(`✓ Screenshot saved: ${screenshotPath}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`✗ Failed to process ${work.name}:`, errorMessage);
      console.error(`  Continuing with next entry...\n`);
    }
  }

  console.log("\n✓ Screenshot capture complete!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
