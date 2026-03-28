import type { View } from "../library/html/index";
import { ensureObject } from "../library/ensure-object";
import { tag } from "../library/html/index";

export const viewLink: View = (attrs, children) => {
  const href = attrs?.["href"];

  if (typeof href === "string" && href.trim().length > 0) {
    return tag(
      "a",
      {
        ...attrs,
        target: "_blank",
        rel: "noreferrer noopener",
        style: {
          ...ensureObject(attrs?.["style"]),
          "text-decoration": "underline",
        },
      },
      children
    );
  }

  return tag("span", attrs, children);
};
