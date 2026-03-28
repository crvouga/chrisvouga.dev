import { execSync } from "child_process";
import path from "path";
import { getAllFiles } from "./library/file-system";

const dir = "./public";
const width = 600;

console.log("Optimizing images...");

const allFiles = getAllFiles(dir);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const isOptimized = (file: string): boolean => file.includes(".optimized");

allFiles.forEach((file) => {
  if (IMAGE_EXTENSIONS.has(path.extname(file)) && !isOptimized(file)) {
    const inputPath = file;
    const baseName = path.basename(file, path.extname(file));
    const outputPath = path.join(
      path.dirname(file),
      baseName + ".optimized.webp"
    );
    const command = `npx sharp-cli resize --input "${inputPath}" --output "${outputPath}" --width ${width}`;

    console.log(command);
    execSync(command);
  }
});

console.log("Optimization complete");
