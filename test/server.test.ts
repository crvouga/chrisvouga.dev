// @ts-check
import { exec } from "child_process";
import { promisify } from "util";
import { setTimeout } from "timers/promises";

const execAsync = promisify(exec);

const IMAGE_NAME = "portfolio-app-test";
const CONTAINER_NAME = "portfolio-app-test-container";
const PORT = 8080;
const TEST_URL = `http://localhost:${PORT}`;
const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 1000;

/**
 * Execute a shell command and return the result
 * @param {string} command
 * @returns {Promise<{ stdout: string; stderr: string }>}
 */
async function runCommand(command) {
  try {
    return await execAsync(command);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message +
          (error && typeof error === "object" && "stderr" in error
            ? `\nstderr: ${error.stderr}`
            : "") +
          (error && typeof error === "object" && "stdout" in error
            ? `\nstdout: ${error.stdout}`
            : "")
        : String(error);
    throw new Error(`Command failed: ${command}\n${message}`);
  }
}

/**
 * Wait for the container to be ready by checking if it responds
 * @returns {Promise<void>}
 */
async function waitForContainer() {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(TEST_URL, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Container not ready yet, continue retrying
    }
    await setTimeout(RETRY_DELAY_MS);
  }
  throw new Error(
    `Container did not become ready after ${MAX_RETRIES * RETRY_DELAY_MS}ms`
  );
}

/**
 * Print docker logs for the test container if available
 * @returns {Promise<void>}
 */
async function printDockerLogs() {
  try {
    const { stdout } = await runCommand(
      `docker logs ${CONTAINER_NAME} 2>&1 || true`
    );
    if (stdout && stdout.trim()) {
      console.log(`Docker logs for ${CONTAINER_NAME}:\n${stdout}`);
    } else {
      console.log(`(No logs found for container ${CONTAINER_NAME})`);
    }
  } catch (err) {
    console.log(`⚠️  Unable to retrieve Docker logs for ${CONTAINER_NAME}`);
  }
}

/**
 * Clean up Docker resources
 * @returns {Promise<void>}
 */
async function cleanup() {
  try {
    // Stop and remove container if it exists
    await runCommand(`docker rm -f ${CONTAINER_NAME} 2>/dev/null || true`);
    // Remove image if it exists
    await runCommand(`docker rmi ${IMAGE_NAME} 2>/dev/null || true`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Cleanup error (non-fatal):", message);
  }
}

/**
 * Main test function
 */
async function runTest() {
  let testPassed = false;

  try {
    console.log("Cleaning up any existing containers/images...");
    await cleanup();

    console.log("Building Docker image...");
    await runCommand(`docker build -t ${IMAGE_NAME} .`);

    console.log("Starting container...");
    await runCommand(
      `docker run -d --name ${CONTAINER_NAME} -p ${PORT}:80 ${IMAGE_NAME}`
    );

    console.log("Waiting for container to be ready...");
    await waitForContainer();

    console.log("Making HTTP request to test server...");
    const response = await fetch(TEST_URL);

    // Verify status code
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }

    // Verify content type
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("text/html")) {
      throw new Error(`Expected HTML content type, got: ${contentType}`);
    }

    // Verify response body contains HTML
    const body = await response.text();
    if (!body.includes("<!DOCTYPE html") && !body.includes("<html")) {
      throw new Error("Response body does not appear to be HTML");
    }

    console.log("✓ Test passed: Server responds with 200 HTML");
    testPassed = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("✗ Test failed:", message);
    await printDockerLogs();
    process.exitCode = 1;
  } finally {
    console.log("Cleaning up...");
    await cleanup();
    if (!testPassed) {
      // Show final docker logs (if any) after cleanup, for clarity
      // (the logs above are just before cleanup, but sometimes container is alive)
      await printDockerLogs();
    }
    process.exit(testPassed ? 0 : 1);
  }
}

// Run the test
runTest();
