import { fragment, tag, text } from "../library/html/index.js";
import { HEAD } from "./head.js";
import { THEME } from "./theme.js";

/**
 * @type {import("../library/html/index.js").ViewWithProps<{src: string, alt: string, fetchPriority?: "high" | "auto"}>}
 */
export const viewImage = (props) => (attr, _) => {
  /**
   * @type {Record<string, any>}
   */
  const imgAttributes = {
    ...attr,
    src: props.src,
    alt: props.alt,
    class: ["image animate-pulse", attr?.["class"]]
      .filter(Boolean)
      .join(" "),
    onload: "onImageLoad(event)",
  };

  if (props.fetchPriority) {
    imgAttributes["fetchpriority"] = props.fetchPriority;
  }

  if (props.fetchPriority === "high") {
    imgAttributes["loading"] = "eager";
  }

  return fragment([
    tag(
      "img",
      imgAttributes,
      []
    ),
  ]);
};

HEAD.push(
  tag("script", {}, [
    text(`
      function onImageLoad(e) {
        e.target.classList.remove('animate-pulse');
      }
      `),
  ])
);

HEAD.push(
  tag("style", {}, [
    text(`
    .image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background-color: ${THEME.colors.skeleton};
    }
    .animate-pulse {
        animation: pulse 1.5s infinite;
    }
    
    @keyframes pulse {
        0%, 100% {
            opacity: 0.5;
        }
        50% {
            opacity: 1;
        }
    }
        `),
  ])
);
