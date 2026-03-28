// @ts-check

import { ensureObject } from "../../../library/ensure-object.js";
import { appendExternalLinkIndicator } from "../../../ui/external-link-indicator.js";
import { viewLink } from "../../../ui/link.js";
import { viewTypography } from "../../../ui/typography.js";

/**
 * Creates a linked title component for a project card
 * @type {import("../props.js").ProjectCardView}
 */
const viewProjectCardContentTitleLinked = (props) => (a, _c) => {
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

/**
 * @type {import("../props.js").ProjectCardView}
 */
export const viewProjectCardContentTitle = (props) => (a, _c) => {
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
