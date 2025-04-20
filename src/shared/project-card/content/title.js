// @ts-check

import { ensureObject } from "../../../library/ensure-object.js";
import { viewLink } from "../../../ui/link.js";
import { viewTypography } from "../../../ui/typography.js";

/**
 * @type {import("../props.js").ProjectCardView}
 */
export const viewProjectCardContentTitle = (props) => (a, _c) => {
  const inner = viewTypography({
    level: "h3",
    text: props.project.title,
  });
  if (props.linkHref) {
    return viewLink(
      {
        ...a,
        href: props.linkHref,
        style: {
          ...ensureObject(a?.["style"]),
        },
      },
      [
        inner({
          style: {
            ...ensureObject(a?.["style"]),
          },
        }),
      ]
    );
  }

  return inner({
    ...a,
    style: {
      ...ensureObject(a?.["style"]),
    },
  });
};
