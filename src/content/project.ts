import type { Topic } from "./topic";
import type {
  Code as _Code,
  Deployment as _Deployment,
  Project as _Project,
} from "../../projects";
import {
  PROJECTS as _PROJECTS,
  WORK_PROJECTS as _WORK_PROJECTS,
  SIDE_PROJECTS as _SIDE_PROJECTS,
} from "../../projects";

export type Code = _Code;
export type Deployment = _Deployment;
export type Project = Omit<_Project, "topics"> & { readonly topics: Topic[] };

export { projectToLinkHref } from "../../projects";

export const PROJECTS = _PROJECTS as readonly Project[];
export const WORK_PROJECTS = _WORK_PROJECTS as readonly Project[];
export const SIDE_PROJECTS = _SIDE_PROJECTS as readonly Project[];
