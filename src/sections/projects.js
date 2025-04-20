// @ts-check

import { data } from "../content/index.js";
import { viewProjectCard } from "../shared/project-card/index.js";
import { viewSection } from "../shared/section.js";
import { viewGridCollapsible } from "../ui/grid-collapsible.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewProjectsSection = (a, _) => {
  return viewSection({
    title: "Projects",
    subtitle:
      "This is a list of all the different projects I've worked on over the years. Including work projects and side projects.",
  })(a, [
    viewGridCollapsible({
      maxVisibleCardCount: 6,
      children: [
        ...data.workProjects.map((project) => viewProjectCard({ project })()),
        ...data.sideProjects.map((project) => viewProjectCard({ project })()),
      ],
      jsVarSafeNamespace: "projectsSection",
    })(),
  ]);
};
