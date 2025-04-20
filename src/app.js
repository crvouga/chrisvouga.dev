// @ts-check
import { CONTENT } from "./content/content.js";
import { tag, text } from "./library/html/index.js";
import { replaceAll } from "./library/replace-all.js";
import { viewAboutMeSection } from "./sections/about-me.js";
import { viewContactSection } from "./sections/contact.js";
import { viewSchoolSection } from "./sections/school.js";
import { viewFooterSection } from "./sections/footer.js";
import { viewHeadingSection } from "./sections/heading/index.js";
import { viewProjectsSection } from "./sections/projects.js";
import { viewWorkSection } from "./sections/work.js";
import { HEAD } from "./ui/head.js";
import { THEME } from "./ui/theme.js";

/**
 * @returns {import("./library/html/index.js").Html}
 */
export const viewApp = () => {
  return viewDoc({}, [
    tag("main", { class: "main" }, [
      viewHeadingSection(),
      viewWorkSection(),
      viewProjectsSection(),
      viewSchoolSection(),
      viewAboutMeSection(),
      viewContactSection(),
      viewFooterSection(),
    ]),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
    .main {
      max-width: 1150px;      
      margin: auto;
      display: flex;
      align-items: items-center;
      flex-direction: column;
      gap: 72px;
      padding: 72px 12px;
      overflow-x: hidden;
    }
  `),
  ])
);

/**
 * @type {import("./library/html/index.js").View}
 */
export const viewDoc = (_a, c) => {
  return tag("html", { lang: "en" }, [
    tag("head", {}, [
      tag("meta", { charset: "UTF-8" }, []),
      tag(
        "meta",
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0",
        },
        []
      ),
      tag("title", {}, [text(CONTENT.META_TITLE)]),
      tag(
        "meta",
        {
          name: "description",
          content: replaceAll(
            replaceAll(CONTENT.META_DESCRIPTION, "\n", ""),
            "\t",
            ""
          ),
        },
        []
      ),
      tag("link", { rel: "shortcut icon", href: "/favicon.ico" }, []),
      tag("link", { rel: "icon", href: "/favicon.ico" }, []),
      tag(
        "script",
        {
          src: "./web-components/toaster-element.js",
          async: "true",
        },
        []
      ),
      tag(
        "script",
        {
          src: "./web-components/loading-spinner-element.js",
          async: "true",
        },
        []
      ),
      tag(
        "script",
        {
          src: "./web-components/image-gallery-modal-element.js",
          async: "true",
        },
        []
      ),
      ...HEAD,
    ]),
    tag("body", {}, [
      tag(
        "toaster-element",
        {
          id: "toaster",
          "data-bg-color": THEME.colors.paper,
          "data-border-color": THEME.colors.paperBorder,
          "data-text-color": THEME.colors.text,
        },
        []
      ),

      ...(c ?? []),
    ]),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
    * { 
      font-family: Inter, -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"; 
      color: ${THEME.colors.text};
    }
    body {
      margin: 0;
      padding: 0;
      background-color: ${THEME.colors.background};
      overflow-x: hidden;
      overflow-y: auto;
    }
    
    ::-webkit-scrollbar {
        width: 12px;
    }

    ::-webkit-scrollbar-track {
        background: ${THEME.colors.background};
    }

    ::-webkit-scrollbar-thumb {
        background-color: ${THEME.colors.paperBorder};
        border-radius: 6px;
        border: 3px solid ${THEME.colors.background};
    }

    body {
        scrollbar-width: thin;           
        scrollbar-color: ${THEME.colors.paperBorder} ${THEME.colors.background};  
    }

    body {
        -ms-overflow-style: none; 
    }
    
    body::-webkit-scrollbar {
        display: none;
    }
  `),
  ])
);
