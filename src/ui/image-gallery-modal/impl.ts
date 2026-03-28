import type { OpenImageGalleryModalJsFunction, ViewImageGalleryModalFunction } from "./interface";
import * as implElement from "./impl-element";
import * as implTemplate from "./impl-template";

type Impl = "element" | "template";

const of = (x: Impl): Impl => x;

const IMPL = of("element");

export const openImageGalleryModalJs: OpenImageGalleryModalJsFunction = (props) => {
  switch (IMPL) {
    case "element":
      return implElement.openImageGalleryModalJs(props);
    case "template":
      return implTemplate.openImageGalleryModalJs(props);
  }
};

export const viewImageGalleryModal: ViewImageGalleryModalFunction = (props) => () => {
  switch (IMPL) {
    case "element":
      return implElement.viewImageGalleryModal(props)();
    case "template":
      return implTemplate.viewImageGalleryModal(props)();
  }
};
