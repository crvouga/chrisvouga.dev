import { chromium } from "playwright";
import path from "path";
import { mkdir } from "fs/promises";
import { PROJECTS } from "./content/project";

const PUBLIC_DIR = path.resolve("./public");

const VIEWPORT = { width: 1920, height: 1080 };

const titleToFilename = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
  console.log("Starting screenshot capture for project websites...\n");

  await mkdir(PUBLIC_DIR, { recursive: true });

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
