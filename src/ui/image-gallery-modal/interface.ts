import type { ViewWithProps } from "../../library/html/index";

export type ImageGalleryModalProps = {
  jsVarSafeNamespace: string;
  imageSrc: string[];
  imageAlt?: string;
  skeletonColor?: string;
};

export type OpenImageGalleryModalJsFunction = (input: {
  jsVarSafeNamespace: string;
}) => string;

export type ViewImageGalleryModalFunction = ViewWithProps<ImageGalleryModalProps>;
