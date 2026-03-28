import { test, expect } from "bun:test";
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

async function runCommand(command: string): Promise<{ stdout: string; stderr: string }> {
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

async function waitForContainer(): Promise<void> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(TEST_URL, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Container not ready yet, continue retrying
    }
    await setTimeout(RETRY_DELAY_MS);
  }
  throw new Error(
    `Container did not become ready after ${MAX_RETRIES * RETRY_DELAY_MS}ms`
  );
}

async function printDockerLogs(): Promise<void> {
  try {
    const { stdout } = await runCommand(
      `docker logs ${CONTAINER_NAME} 2>&1 || true`
    );
    if (stdout && stdout.trim()) {
      console.log(`Docker logs for ${CONTAINER_NAME}:\n${stdout}`);
    } else {
      console.log(`(No logs found for container ${CONTAINER_NAME})`);
    }
  } catch {
    console.log(`Unable to retrieve Docker logs for ${CONTAINER_NAME}`);
  }
}

async function cleanup(): Promise<void> {
  try {
    await runCommand(`docker rm -f ${CONTAINER_NAME} 2>/dev/null || true`);
    await runCommand(`docker rmi ${IMAGE_NAME} 2>/dev/null || true`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Cleanup error (non-fatal):", message);
  }
}

test("Docker container serves HTML on port 80", async () => {
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

    expect(response.status).toBe(200);

    const contentType = response.headers.get("content-type") || "";
    expect(contentType.includes("html") || contentType.includes("text/html")).toBe(true);

    const body = await response.text();
    expect(body.includes("<!DOCTYPE html") || body.includes("<html")).toBe(true);

    console.log("✓ Test passed: Server responds with 200 HTML");
  } catch (error) {
    await printDockerLogs();
    throw error;
  } finally {
    console.log("Cleaning up...");
    await cleanup();
  }
});
