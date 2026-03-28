import { tag, text } from "../../../library/html/index";
import { stringToJsVarSafe } from "../../../library/js-var";
import { HEAD } from "../../../ui/head";
import { THEME } from "../../../ui/theme";
import { viewOpenGalleryButtonImageWrapper } from "../../../ui/image-gallery-modal/open-gallery-button-image-wrapper";
import type { ProjectCardView } from "../props";

export const viewProjectCardMediaImage: ProjectCardView = (props) => {
  const src = props.project?.imageSrc?.[0];
  if (src) {
    return viewProjectCardMediaImageMain(props);
  }
  return viewProjectCardMediaGradient(props);
};

const viewProjectCardMediaImageMain: ProjectCardView = (props) => (attr, _) => {
  const alt = props.project?.imageAlt;
  const src = props.project?.imageSrc?.[0] ?? " ";
  const jsVarSafeNamespace = stringToJsVarSafe(props.project.title);

  return viewOpenGalleryButtonImageWrapper({
    src,
    alt,
    galleryImages: props.project?.galleryImageSrc ?? [],
    jsVarSafeNamespace,
    showGalleryIndicator: true,
    fetchPriority: props.fetchPriority ?? "auto",
  })({ ...attr, class: "project-card-media-image" }, []);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .project-card-media-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
    `),
  ])
);

const viewProjectCardMediaGradient: ProjectCardView = (_) => (attr, _c) => {
  return tag("div", { ...attr, class: "project-card-media-gradient" }, []);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .project-card-media-gradient {
        width: 100%;
        height: 100%;
        background: linear-gradient(to right bottom, ${THEME.colors.paper}, ${THEME.colors.skeleton});
      }
    `),
  ])
);
