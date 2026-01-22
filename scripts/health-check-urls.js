#!/usr/bin/env node

/**
 * Health check script that verifies all URLs in content files are accessible
 */

import { CONTENT } from "../src/content/content.js";
import { PROJECTS } from "../src/content/project.js";
import { WORK } from "../src/content/work.js";

/**
 * @param {string} url
 * @returns {Promise<{url: string; status: number; ok: boolean; error?: string; duration: number}>}
 */
const checkUrl = async (url) => {
  const startTime = Date.now();
  console.log(`Checking: ${url}...`);
  
  const isLinkedIn = url.includes("linkedin.com");
  
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    const duration = Date.now() - startTime;
    
    // LinkedIn returns 999 for bot protection, but the URL is accessible
    const isOk = response.ok || (isLinkedIn && response.status === 999);
    
    const result = {
      url,
      status: response.status,
      ok: isOk,
      duration,
    };
    
    if (result.ok) {
      const statusNote = isLinkedIn && response.status === 999 ? " (bot protection)" : "";
      console.log(`  ✓ OK (${result.status})${statusNote} - ${duration}ms`);
    } else {
      console.log(`  ✗ FAILED (${result.status}) - ${duration}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const result = {
      url,
      status: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
    };
    console.log(`  ✗ ERROR: ${error instanceof Error ? error.message : String(error)} - ${duration}ms`);
    return result;
  }
};

/**
 * @returns {string[]}
 */
const extractUrls = () => {
  const urls = new Set();

  // From CONTENT
  if (CONTENT.SITE_URL) urls.add(CONTENT.SITE_URL);
  if (CONTENT.SITE_SOURCE_CODE_URL) urls.add(CONTENT.SITE_SOURCE_CODE_URL);
  if (CONTENT.GITHUB_URL) urls.add(CONTENT.GITHUB_URL);
  if (CONTENT.LINKEDIN_URL) urls.add(CONTENT.LINKEDIN_URL);

  // From PROJECTS
  for (const project of PROJECTS) {
    if (project.deployment?.t === "public" && project.deployment.url) {
      urls.add(project.deployment.url);
    }
    if (project.code?.t === "public" && project.code.url) {
      urls.add(project.code.url);
    }
  }

  // From WORK
  for (const work of WORK) {
    if (work.infoUrl) {
      urls.add(work.infoUrl);
    }
  }

  return Array.from(urls).sort();
};

const main = async () => {
  const urls = extractUrls();
  console.log(`\n🔍 Health Check: Checking ${urls.length} URL(s)\n`);
  console.log("=".repeat(60));

  const startTime = Date.now();
  const results = await Promise.all(urls.map(checkUrl));
  const totalDuration = Date.now() - startTime;

  console.log("=".repeat(60));
  console.log("\n📊 Summary:\n");

  let failed = 0;
  const failedUrls = [];
  
  for (const result of results) {
    if (!result.ok) {
      failed++;
      failedUrls.push({
        url: result.url,
        error: result.error || `HTTP ${result.status}`,
      });
    }
  }

  // Show summary statistics
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const maxDuration = Math.max(...results.map((r) => r.duration));
  const minDuration = Math.min(...results.map((r) => r.duration));

  console.log(`Total URLs checked: ${results.length}`);
  console.log(`Successful: ${results.length - failed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total time: ${totalDuration}ms`);
  console.log(`Average response time: ${Math.round(avgDuration)}ms`);
  console.log(`Fastest: ${minDuration}ms`);
  console.log(`Slowest: ${maxDuration}ms`);

  if (failed > 0) {
    console.log("\n❌ Failed URLs:\n");
    for (const failedUrl of failedUrls) {
      console.log(`  • ${failedUrl.url}`);
      console.log(`    Error: ${failedUrl.error}`);
    }
    console.error(`\n❌ Health check failed: ${failed} URL(s) are not accessible`);
    process.exit(1);
  }

  console.log("\n✅ All URLs are healthy!");
};

main().catch((error) => {
  console.error("Health check failed:", error);
  process.exit(1);
});
