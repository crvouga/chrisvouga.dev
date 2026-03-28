import { execSync } from "child_process";
import path from "path";
import { getAllFiles } from "./library/file-system.js";

/**
 * The directory to search in.
 * @type {string}
 */
const dir = "./public";

/**
 * The width to which the PNG images will be resized.
 * @type {number}
 */
const width = 600;

console.log("Optimizing images...");

/**
 * An array of all files found recursively in `dir`.
 * @type {string[]}
 */
const allFiles = getAllFiles(dir);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 *
 * @param {string} file
 * @returns {boolean}
 */
const isOptimized = (file) => file.includes(".optimized");

allFiles.forEach((file) => {
  if (IMAGE_EXTENSIONS.has(path.extname(file)) && !isOptimized(file)) {
    /**
     * The input PNG file path.
     * @type {string}
     */
    const inputPath = file;

    /**
     * The base name of the file without extension.
     * @type {string}
     */
    const baseName = path.basename(file, path.extname(file));

    /**
     * The output file path with the `.optimized.webp` suffix.
     * @type {string}
     */
    const outputPath = path.join(
      path.dirname(file),
      baseName + ".optimized.webp"
    );

    /**
     * The `sharp-cli` command to run.
     * @type {string}
     */
    const command = `npx sharp-cli resize --input "${inputPath}" --output "${outputPath}" --width ${width}`;

    console.log(command);
    execSync(command);
  }
});

console.log("Optimization complete");
