import type { ViewWithProps } from "../library/html/index";
import { tag, text } from "../library/html/index";
import { HEAD } from "./head";
import { viewImage } from "./image";

export const viewAvatar: ViewWithProps<{src: string; alt: string}> = (props) => (attr, children) => {
  const className = ["avatar", attr?.["class"]].filter(Boolean).join(" ");

  return viewImage(props)(
    {
      ...attr,
      class: className,
    },
    [...(children ?? [])]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .avatar {
        aspect-ratio: 1;
        border-radius: 50%;
        object-fit: cover;
        overflow: hidden;
      }
    `),
  ])
);
