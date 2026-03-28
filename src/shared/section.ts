import { type View, tag, text } from "../library/html/index";
import { HEAD } from "../ui/head";
import { viewSectionTitle } from "./section-title";

export const viewSection = (props: { title: string; subtitle?: string }): View => (attr, c) => {
  return tag(
    "section",
    {
      ...attr,
      class: "section",
    },
    [viewSectionTitle(props)(), ...(c ?? [])]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
    .section {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
  `),
  ])
);
