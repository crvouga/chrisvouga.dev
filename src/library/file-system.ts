// @ts-check
import { readdirSync } from "fs";
import { copyFile, mkdir, readdir, rm } from "fs/promises";
import path, { join } from "path";

/**
 * Deletes a directory and its contents.
 * @param {string} path - The path of the directory to delete.
 * @returns {Promise<void>}
 */
export const deleteDirectory = async (path) => {
  await rm(path, { recursive: true, force: true });
};

/**
 * Copies the contents of a directory to another location.
 * @param {string} src - The source directory path.
 * @param {string} dest - The destination directory path.
 * @returns {Promise<void>}
 */
export const copyDirectory = async (src, dest) => {
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

/**
 * Recursively retrieve all files from a given directory.
 *
 * @param {string} dirPath - The directory path to search.
 * @returns {string[]} An array of file paths.
 */
export const getAllFiles = (dirPath) => {
  /** @type {string[]} */
  let filesList = [];

  /** @type {import('fs').Dirent[]} */
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
