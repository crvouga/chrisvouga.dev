import { type ViewWithProps, tag, text } from "../library/html/index";
import { viewTypography } from "../ui/typography";
import { HEAD } from "../ui/head";

export const viewSectionTitle: ViewWithProps<{ title: string; subtitle?: string }> = (p) => (_a, _c) => {
  return tag("div", { class: "section-title" }, [
    viewTypography({ level: "h2", text: p.title })(),
    ...(p.subtitle
      ? [
          viewTypography({
            level: "body-md",
            text: p.subtitle,
          })({
            style: {
              "max-width": "720px",
            },
          }),
        ]
      : []),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .section-title {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    `),
  ])
);
