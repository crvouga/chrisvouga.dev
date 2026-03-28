import type { Project } from "../../content/project";
import type { ViewWithProps } from "../../library/html/index";

export type ProjectCardProps = {
  project: Project;
  linkHref?: string | null;
  fetchPriority?: "high" | "auto";
};

export type ProjectCardView = ViewWithProps<ProjectCardProps>;
