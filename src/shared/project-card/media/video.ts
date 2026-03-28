// @ts-check

import { tag, text } from "../../../library/html/index.js";
import { toYouTubeVideoUrl } from "../../../library/youtube.js";
import { HEAD } from "../../../ui/head.js";

/**
 * @type {import("../props.js").ProjectCardView}
 */
export const viewProjectCardMediaVideo = (props) => (attr, _) => {
  // @ts-ignore
  if (!props.project?.youTubeVideoId) {
    throw new Error("missing youTubeVideoId");
  }

  const videoUrl = toYouTubeVideoUrl({
    // @ts-ignore
    youTubeVideoId: props.project.youTubeVideoId,
  });

  const posterImage = props.project?.imageSrc?.[0] ?? null;

  return tag(
    "div",
    {
      ...attr,
      class: "project-card-media-video-container",
    },
    [
      tag(
        "div",
        {
          class: "project-card-media-video-thumbnail",
          style: `background-image: url('${posterImage}');`,
          onclick: `loadYouTubeVideo(this, '${videoUrl}')`,
        },
        [
          tag("button", { class: "project-card-media-video-play-button" }, [
            text("▶"),
          ]),
        ]
      ),
    ]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .project-card-media-video-container {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      .project-card-media-video-thumbnail {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-size: cover;
        background-position: center;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .project-card-media-video-play-button {
        background: rgba(0, 0, 0, 0.6);
        color: white;
        font-size: 2rem;
        border: none;
        border-radius: 50%;
        width: 60px;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .project-card-media-video-play-button:hover {
        background: rgba(0, 0, 0, 0.8);
      }
    `),
  ])
);

// Add script to dynamically load YouTube iframe
HEAD.push(
  tag("script", {}, [
    text(`
      function loadYouTubeVideo(container, videoUrl) {
        // Clear the thumbnail content
        container.innerHTML = '';

        // Create and append the iframe
        const iframe = document.createElement('iframe');
        iframe.src = videoUrl;
        iframe.className = 'project-card-media-video';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.frameBorder = '0';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        container.appendChild(iframe);
      }
      `),
  ])
);
