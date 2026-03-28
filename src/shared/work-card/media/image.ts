import { type ViewWithProps, tag, text } from "../../../library/html/index";
import type { Work } from "../../../content/work";
import { stringToJsVarSafe } from "../../../library/js-var";
import { HEAD } from "../../../ui/head";
import { THEME } from "../../../ui/theme";
import { viewOpenGalleryButtonImageWrapper } from "../../../ui/image-gallery-modal/open-gallery-button-image-wrapper";

type WorkCardMediaProps = { work: Work; fetchPriority?: "high" | "auto" };

export const viewWorkCardMediaImage: ViewWithProps<WorkCardMediaProps> = (props) => {
  const src = props.work?.imageSrc?.[0];
  if (src) {
    return viewWorkCardMediaImageMain(props);
  }
  return viewWorkCardMediaGradient(props);
};

const viewWorkCardMediaImageMain: ViewWithProps<WorkCardMediaProps> = (props) => (attr, _) => {
  const alt = props.work?.imageAlt ?? "";
  const src = props.work?.imageSrc?.[0] ?? " ";
  const jsVarSafeNamespace = stringToJsVarSafe(props.work.name);

  return viewOpenGalleryButtonImageWrapper({
    src,
    alt,
    galleryImages: props.work?.galleryImageSrc ?? [],
    jsVarSafeNamespace,
    showGalleryIndicator: true,
    fetchPriority: props.fetchPriority ?? "auto",
  })({ ...attr, class: "work-card-media-image" }, []);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .work-card-media-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
    `),
  ])
);

const viewWorkCardMediaGradient: ViewWithProps<{ work: Work }> = (_) => (attr, _c) => {
  return tag("div", { ...attr, class: "work-card-media-gradient" }, []);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .work-card-media-gradient {
        width: 100%;
        height: 100%;
        background: linear-gradient(to right bottom, ${THEME.colors.paper}, ${THEME.colors.skeleton});
      }
    `),
  ])
);
