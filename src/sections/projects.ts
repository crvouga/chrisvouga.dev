import { CONTENT } from "../content/content";
import type { View } from "../library/html/index";
import { viewProjectCard } from "../shared/project-card/index";
import { viewSection } from "../shared/section";
import { viewGridCollapsible } from "../ui/grid-collapsible";

export const viewProjectsSection: View = (a, _) => {
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
