/**
 * @typedef {{t: "private";} | {t: "public"; url: string;}} Code
 */

/**
 * @typedef {{t: "public",  url: string,} | { t: "not-deployed-anymore",} | {t: "private"}} Deployment
 */

/**
 * @typedef {{
 * title: string;
 * deployment: Deployment;
 * code: Code;
 * description: string;
 * imageSrc: string[];
 * imageAlt: string;
 * youTubeVideoId?: string;
 * topics: import("./topic.js").Topic[];
 * setting: "work" | "side";
 * }} Project
 */

/**
 *
 * @param {Project} project
 * @returns {string | null}
 */
export const projectToLinkHref = (project) => {
  if (project.deployment.t === "public") {
    return project.deployment.url;
  }
  if (project.code.t === "public") {
    return project.code.url;
  }
  return null;
};
