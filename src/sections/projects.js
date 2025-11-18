// @ts-check

import { CONTENT } from "../content/content.js";
import { viewProjectCard } from "../shared/project-card/index.js";
import { viewSection } from "../shared/section.js";
import { viewGridCollapsible } from "../ui/grid-collapsible.js";

/**
 * @type {import("../library/html/index.js").View}
 */
export const viewProjectsSection = (a, _) => {
  const N = 3;
  return viewSection({
    title: CONTENT.PROJECT_SECTION_TITLE,
  })(a, [
    viewGridCollapsible({
      maxVisibleCardCount: 6,
      children: [
        ...CONTENT.PROJECTS.map((project, index) =>
          viewProjectCard({
            project,
            fetchPriority: index < N ? "high" : "auto",
          })()
        ),
      ],
      jsVarSafeNamespace: "projectsSection",
    })(),
  ]);
};
