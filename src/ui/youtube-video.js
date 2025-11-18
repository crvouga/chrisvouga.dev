// @ts-check

import { tag, text } from "../library/html/index.js";
import { HEAD } from "./head.js";
import { THEME, unit } from "./theme.js";

/**
 * @typedef {{ src: string; title?: string }} Props
 */

/**
 * @type {import("../library/html/index.js").ViewWithProps<Props>}
 */
export const viewYouTubeVideo = (props) => (attrs) => {
  return tag(
    "div",
    {
      ...attrs,
      class: "youtube-video-container",
    },
    [
      tag("div", { class: "youtube-video-placeholder" }, [
        tag("div", { class: "youtube-video-placeholder-content" }, [
          tag("div", { class: "youtube-video-placeholder-icon" }, [text("▶")]),
        ]),
      ]),
      tag("iframe", {
        src: props.src,
        class: "youtube-video",
        allow:
          "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
        allowfullscreen: "true",
        frameborder: "0",
        title: props.title || "YouTube video",
        loading: "lazy",
      }),
    ]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .youtube-video-container {
        width: 100%;
        margin-top: ${unit(3)};
        position: relative;
        padding-bottom: 56.25%; /* 16:9 aspect ratio */
        height: 0;
        overflow: hidden;
        border-radius: 8px;
        background: linear-gradient(
          135deg,
          ${THEME.colors.paper} 0%,
          ${THEME.colors.skeleton} 100%
        );
        border: 1px solid ${THEME.colors.paperBorder};
      }
      .youtube-video-placeholder {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
        pointer-events: none;
        animation: fadeOutPlaceholder 0.5s ease 1s forwards;
      }
      @keyframes fadeOutPlaceholder {
        to {
          opacity: 0;
          visibility: hidden;
        }
      }
      .youtube-video-placeholder-content {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background-color: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      .youtube-video-placeholder-icon {
        font-size: 32px;
        color: ${THEME.colors.text};
        opacity: 0.9;
        margin-left: 4px;
      }
      .youtube-video {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
        border-radius: 8px;
        z-index: 1;
        background-color: ${THEME.colors.paper};
      }
    `),
  ])
);
