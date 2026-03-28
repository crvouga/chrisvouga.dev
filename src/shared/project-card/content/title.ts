import { ensureObject } from "../../../library/ensure-object";
import { appendExternalLinkIndicator } from "../../../ui/external-link-indicator";
import { viewLink } from "../../../ui/link";
import { viewTypography } from "../../../ui/typography";
import type { ProjectCardView } from "../props";

const viewProjectCardContentTitleLinked: ProjectCardView = (props) => (a, _c) => {
  return viewLink(
    {
      ...a,
      href: props.linkHref,
      style: {
        ...ensureObject(a?.["style"]),
      },
    },
    [
      viewTypography({
        level: "h3",
        text: appendExternalLinkIndicator({
          text: props.project.title,
        }),
      })({
        style: {
          ...ensureObject(a?.["style"]),
        },
      }),
    ]
  );
};

export const viewProjectCardContentTitle: ProjectCardView = (props) => (a, _c) => {
  if (props.linkHref) {
    return viewProjectCardContentTitleLinked(props)(a, _c);
  }

  return viewTypography({
    level: "h3",
    text: props.project.title,
  })({
    ...a,
    style: {
      ...ensureObject(a?.["style"]),
    },
  });
};
