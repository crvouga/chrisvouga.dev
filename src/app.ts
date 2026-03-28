import { CONTENT } from "./content/content.js";
import { tag, text } from "./library/html/index.js";
import { replaceAll } from "./library/replace-all.js";
import { viewAboutMeSection } from "./sections/about-me.js";
import { viewFooterSection } from "./sections/footer.js";
import { viewHeadingSection } from "./sections/heading/index.js";
import { viewProjectsSection } from "./sections/projects.js";
import { viewSchoolSection } from "./sections/school.js";
import { viewWorkSection } from "./sections/work.js";
import { HEAD } from "./ui/head.js";
import { THEME } from "./ui/theme.js";
import { viewImage } from "./ui/image.js";

/**
 * @returns {import("./library/html/index.js").Html}
 */
export const viewApp = () => {
  return viewDoc({}, [
    tag("main", { class: "main" }, [
      viewHeadingSection(),
      viewWorkSection(),
      viewProjectsSection(),
      viewAboutMeSection(),
      viewSchoolSection(),
    ]),
    viewFooterSection(),
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
      gap: 96px;
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
      // Open Graph meta tags
      tag(
        "meta",
        {
          property: "og:title",
          content: CONTENT.META_TITLE,
        },
        []
      ),
      tag(
        "meta",
        {
          property: "og:description",
          content: replaceAll(
            replaceAll(CONTENT.META_DESCRIPTION, "\n", ""),
            "\t",
            ""
          ),
        },
        []
      ),
      tag(
        "meta",
        {
          property: "og:image",
          content: `${CONTENT.SITE_URL}/main-site-screenshot.png`,
        },
        []
      ),
      tag(
        "meta",
        {
          property: "og:url",
          content: CONTENT.SITE_URL,
        },
        []
      ),
      tag(
        "meta",
        {
          property: "og:type",
          content: "website",
        },
        []
      ),
      tag(
        "meta",
        {
          property: "og:site_name",
          content: CONTENT.PAGE_TITLE,
        },
        []
      ),
      // Twitter Card meta tags
      tag(
        "meta",
        {
          name: "twitter:card",
          content: "summary_large_image",
        },
        []
      ),
      tag(
        "meta",
        {
          name: "twitter:title",
          content: CONTENT.META_TITLE,
        },
        []
      ),
      tag(
        "meta",
        {
          name: "twitter:description",
          content: replaceAll(
            replaceAll(CONTENT.META_DESCRIPTION, "\n", ""),
            "\t",
            ""
          ),
        },
        []
      ),
      tag(
        "meta",
        {
          name: "twitter:image",
          content: `${CONTENT.SITE_URL}/main-site-screenshot.png`,
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
      // Main site screenshot - first visible image for crawlers
      tag("div", { class: "main-site-screenshot-container" }, [
        viewImage({
          src: "/main-site-screenshot.png",
          alt: `${CONTENT.PAGE_TITLE} - ${CONTENT.PAGE_SUBTITLE} portfolio website screenshot`,
          fetchPriority: "high",
        })({ class: "main-site-screenshot" }, []),
      ]),

      ...(c ?? []),
    ]),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
    * { 
      font-family: -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"; 
      color: ${THEME.colors.text};
      touch-action: manipulation !important; /* Prevents double-tap to zoom */
    }
    html {
      overflow-y: scroll; /* Always reserve scrollbar space to prevent layout shifts */
    }

    body {
      margin: 0;
      padding: 0;
      background-color: ${THEME.colors.background};
      overflow-x: hidden;
      overflow-y: auto;
    }
    
    .main-site-screenshot-container {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }
    
    .main-site-screenshot-container .main-site-screenshot {
      width: 100%;
      height: auto;
      display: block;
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
        scrollbar-width: auto; /* Always show scrollbar in Firefox */
        scrollbar-color: ${THEME.colors.paperBorder} ${THEME.colors.background};  
    }

    body {
        -ms-overflow-style: scrollbar; /* Always show scrollbar in IE/Edge */
    }
  `),
  ])
);
