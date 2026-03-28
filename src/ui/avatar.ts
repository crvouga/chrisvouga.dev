import { tag, text } from "../library/html/index.js";
import { HEAD } from "./head.js";
import { viewImage } from "./image.js";

/**
 * @type {import("../library/html/index.js").ViewWithProps<{src:string; alt: string}>}
 */
export const viewAvatar = (props) => (attr, children) => {
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
