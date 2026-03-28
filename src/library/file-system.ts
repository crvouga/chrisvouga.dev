import { readdirSync } from "fs";
import { copyFile, mkdir, readdir, rm } from "fs/promises";
import path, { join } from "path";

export const deleteDirectory = async (path: string): Promise<void> => {
  await rm(path, { recursive: true, force: true });
};

export const copyDirectory = async (
  src: string,
  dest: string,
): Promise<void> => {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
};

export const getAllFiles = (dirPath: string): string[] => {
  let filesList: string[] = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      filesList = filesList.concat(getAllFiles(fullPath));
    } else {
      filesList.push(fullPath);
    }
  }

  return filesList;
};
