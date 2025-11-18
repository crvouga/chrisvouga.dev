/**
 * @typedef {{t: "private";} | {t: "public"; url: string;}} Code
 */

import { toYouTubeVideoUrl } from "../library/youtube.js";
import { appendExternalLinkIndicator } from "../ui/external-link-indicator.js";
import { a } from "./a.js";

/**
 * @typedef {{
 *   t: "public";
 *   url: string;
 * } | {
 *   t: "not-deployed-anymore";
 * } | {
 *   t: "not-deployed-yet";
 * } | {
 *   t: "private";
 * }} Deployment
 */

/**
 * @typedef {{
 * title: string;
 * deployment: Deployment;
 * code: Code;
 * description: string;
 * imageSrc: string[];
 * imageAlt: string;
 * galleryImageSrc: string[];
 * youTubeVideoId?: string;
 * topics: import("./topic.js").Topic[];
 * setting: "work" | "side";
 * }} Project
 */

/**
 *
 * @param {Project} project
 * @returns {string | null}
 */
export const projectToLinkHref = (project) => {
  if (project.deployment.t === "public") {
    return project.deployment.url;
  }
  if (project.code.t === "public") {
    return project.code.url;
  }
  return null;
};

const IMAGE_ALT = "A screenshot of the project";
const GAMEZILLA_HREF = "https://www.gamezilla.app/";
const LAMDERA_HREF = "https://lamdera.com/";

/**
 * @type {Project}
 */
const PROJECT_NORMALIZER_APP = {
  title: "normalizer.app",
  deployment: {
    t: "public",
    url: "https://normalizer.app/",
  },
  code: {
    t: "private",
  },
  description:
    "A web application that automates data normalization workflows, transforming tabular data (Excel, CSV) between schemas without manual Excel manipulation or custom Python scripts. Streamlines data processing for teams handling diverse data formats.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/normalizer-app.optimized.webp"],
  galleryImageSrc: ["/normalizer-app.png"],
  topics: [
    "typescript",
    "react",
    "tailwind",
    "bun",
    "postgres",
    "s3",
    "trpc",
    "zod",
  ],
  setting: "side",
};

/** @type {Project} */
const PROJECT_TRIANGULATOR = {
  title: "Triangulator",
  deployment: { t: "private" },
  code: { t: "private" },
  description:
    "Enterprise platform that automates course transfer evaluation between universities, streamlining the complex process of determining credit equivalencies. Led development as the technical lead, architecting scalable solutions for handling large-scale academic data processing.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/triangulator.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "yQCrMBHQrDM",
      autoplay: true,
    }),
    "/triangulator/assigned-reject-reason.png",
    "/triangulator/course-search-details-2.png",
    "/triangulator/course-search-loading.png",
    "/triangulator/course-search.png",
    "/triangulator/find-course.png",
    "/triangulator/inst-admin-all-users.png",
    "/triangulator/inst-admin-assign.png",
    "/triangulator/inst-admin-boost-suggestions.png",
    "/triangulator/inst-admin-dashboard.png",
    "/triangulator/inst-admin-download.png",
    "/triangulator/inst-admin-new-suggestions.png",
    "/triangulator/inst-admin-public-profile.png",
    "/triangulator/inst-admin-summary.png",
    "/triangulator/inst-admin-upload-choice.png",
    "/triangulator/inst-admin-upload-course.png",
    "/triangulator/inst-public-profile.png",
    "/triangulator/new-suggestions-assign.png",
    "/triangulator/public-search-filter.png",
    "/triangulator/search-results.png",
    "/triangulator/suggestion-details-reject-reason.png",
    "/triangulator/suggestion-details.png",
    "/triangulator/tri-admin-dashboard.png",
    "/triangulator/tri-admin-new-suggestions.png",
    "/triangulator/tri-admin-suggestion-details.png",
    "/triangulator/tri-admin-summary.png",
  ],
  topics: [
    "typescript",
    "vue",
    "tailwind",
    "nuxt",
    "postgres",
    "python",
    "graphql",
    "aws",
    "graphene",
    "flask",
    "neo4j",
    "s3",
  ],
  setting: "work",
};

/** @type {Project} */
const PROJECT_GAMEZILLA = {
  title: "gamezilla.app",
  deployment: {
    t: "public",
    url: GAMEZILLA_HREF,
  },
  code: {
    t: "private",
  },
  description: `${a(
    GAMEZILLA_HREF,
    appendExternalLinkIndicator({ text: "gamezilla.app" })
  )} is a real-time multiplayer gaming platform built with a full-stack TypeScript implementation of the Elm architecture. Successfully migrated from the ${a(
    LAMDERA_HREF,
    appendExternalLinkIndicator({ text: "Lamdera" })
  )} platform, demonstrating expertise in complex system migrations and real-time application architecture.`,
  imageAlt: IMAGE_ALT,
  imageSrc: ["/gamezilla.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "VSLpdPvHbD4",
      autoplay: true,
    }),
    "/gamezilla.png",
  ],
  topics: [
    "typescript",
    "react",
    "postgres",
    "tailwind",
    "websocket",
    "bun",
    "sqlite",
  ],
  setting: "side",
};

/** @type {Project} */
const PROJECT_STUDY_HALL = {
  title: "Study Hall",
  deployment: {
    t: "public",
    url: "https://gostudyhall.com/",
  },
  code: {
    t: "private",
  },
  description:
    "Educational platform developed in partnership with the Study Hall YouTube channel and ASU. Refactored the payment processing system to enhance reliability, maintainability, and user experience, reducing payment failures and improving system stability.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/studyhall.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "BC4K0u7Zm4k",
      autoplay: true,
      mute: true,
    }),
    "/studyhall/1.png",
    "/studyhall/2.png",
    "/studyhall/3.png",
    "/studyhall/4.png",
    "/studyhall/5.png",
    "/studyhall/6.png",
    "/studyhall/7.png",
    "/studyhall/8.png",
    "/studyhall/9.png",
    "/studyhall/10.png",
    "/studyhall/11.png",
    "/studyhall/12.png",
    "/studyhall/13.png",
  ],
  topics: [
    "javascript",
    "vue",
    "nuxt",
    "bootstrap",
    "aws",
    "dynamodb",
    "salesforce",
    "express",
    "nodejs",
  ],
  setting: "work",
};

/** @type {Project} */
const PROJECT_PICKFLIX = {
  title: "Pickflix",
  deployment: {
    t: "public",
    url: "https://pickflix.chrisvouga.dev/",
  },
  code: {
    t: "public",
    url: "https://github.com/crvouga/pickflix-v1",
  },
  description:
    "Social movie discovery platform enabling users to watch trailers, write reviews, and collaborate on movie lists with friends. Features real-time updates and a comprehensive movie database integration.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/pickflix.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "-atthbuMFIM",
      autoplay: true,
      mute: true,
    }),
    "/pickflix.png",
  ],
  topics: [
    "express",
    "heroku",
    "jest",
    "material-ui",
    "nodejs",
    "postgres",
    "ramda",
    "react",
    "redux",
    "redux-saga",
    "typescript",
    "css",
    "react-query",
  ],
  setting: "side",
};

/** @type {Project} */
const PROJECT_SUN_DEVILS = {
  title: "Sun devils",
  deployment: { t: "public", url: "https://sundevils.com/" },
  code: { t: "private" },
  description:
    "Official website for the ASU Sun Devils athletics program. Developed interactive React components including real-time game schedules and dynamic news feeds, enhancing fan engagement and information accessibility.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/sun-devils.optimized.webp"],
  galleryImageSrc: [
    "/sun-devils.png",
    "/sun-devils/2.png",
    "/sun-devils/3.png",
    "/sun-devils/4.png",
    "/sun-devils/5.png",
  ],
  topics: ["bootstrap", "drupal", "javascript", "react", "css", "php"],
  setting: "work",
};

/** @type {Project} */
const PROJECT_HEADLESS_COMBOBOX = {
  title: "headless-combobox",
  deployment: {
    t: "public",
    url: "https://www.npmjs.com/package/headless-combobox",
  },
  code: {
    t: "public",
    url: "https://github.com/crvouga/headless-combobox",
  },
  imageAlt: IMAGE_ALT,
  imageSrc: ["./headless-combobox.optimized.webp"],
  galleryImageSrc: ["./headless-combobox.png"],
  description: `A production-ready, headless TypeScript combobox library that's framework-agnostic, zero-dependency, and fully accessible. Enables developers to build custom combobox components in any UI framework while maintaining WCAG compliance and flexibility.`,
  topics: ["typescript"],
  setting: "side",
};

/** @type {Project} */
const PROJECT_MOVIEFINDER_RUST = {
  title: "moviefinder.app",
  deployment: {
    t: "public",
    url: "https://www.moviefinder.app/",
  },
  code: {
    t: "public",
    url: "https://github.com/crvouga/moviefinder.app",
  },
  description: "Movie discovery application featuring an intuitive TikTok-style vertical scrolling interface. Built with Rust for performance and modern web technologies for a seamless user experience.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/moviefinder-app.optimized.webp"],
  galleryImageSrc: ["/moviefinder-app.png"],
  topics: ["rust", "tailwind", "postgres", "datastar"],
  setting: "side",
};

/** @type {Project} */
const PROJECT_TODO_APP = {
  title: "Fullstack Todo App",
  code: {
    t: "public",
    url: "https://github.com/crvouga/todo-v1",
  },
  deployment: {
    t: "public",
    url: "https://todo.chrisvouga.dev",
  },
  description: "Full-stack task management application with user authentication and real-time synchronization. Demonstrates end-to-end development capabilities from database design to responsive UI implementation.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/todo.optimized.webp"],
  galleryImageSrc: ["/todo.png"],
  topics: [
    "typescript",
    "vue",
    "css",
    "express",
    "javascript",
    "tailwind",
    "nodejs",
    "mongodb",
  ],
  setting: "side",
};

/** @type {Project} */
const PROJECT_IMAGE_SERVICE = {
  title: "Image service",
  code: {
    t: "public",
    url: "https://github.com/crvouga/imageresizerservice.com",
  },
  deployment: {
    t: "public",
    url: "https://imageservice.chrisvouga.dev",
  },
  description: `Image optimization service built with Go, designed for zero-configuration self-hosting and long-term maintainability. Enables web applications to efficiently serve optimized images without external dependencies.`,
  imageAlt: IMAGE_ALT,
  imageSrc: [],
  galleryImageSrc: [],
  topics: ["go"],
  setting: "side",
};

/** @type {Project} */
const PROJECT_CONNECT_FOUR = {
  title: "Connect Four: AI & Multiplayer",
  deployment: {
    t: "public",
    url: "https://connectfour.chrisvouga.dev/",
  },
  code: {
    t: "public",
    url: "https://github.com/crvouga/connect-four",
  },
  description: "Real-time multiplayer Connect Four game with WebSocket-based synchronization. Features smooth animations, responsive design, and seamless online gameplay for multiple concurrent users.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/connect-four.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "9_TbyftkaQw",
      autoplay: true,
      mute: true,
    }),
    "/connect-four.png",
  ],
  topics: [
    "css",
    "greensock",
    "heroku",
    "material-ui",
    "nodejs",
    "ramda",
    "redux",
    "redux-saga",
    "javascript",
    "socket-io",
  ],
  setting: "side",
};

/** @type {Project} */
const PROJECT_AIRR = {
  title: "Airr Product Demo",
  code: {
    t: "private",
  },
  deployment: {
    t: "public",
    // url: "https://experience-airr.heysia.ai/",
    url: "https://one-origin-airr-production.up.railway.app",
  },
  description:
    "Interactive product demonstration for Airr, an enterprise solution that automates transcript consumption and analysis. Showcases advanced data processing capabilities and intuitive user interface design for complex workflow management.",
  imageAlt: IMAGE_ALT,
  imageSrc: [
    "/airr/1.optimized.webp",
    "/airr/2.optimized.webp",
    "/airr/3.optimized.webp",
    "/airr/4.optimized.webp",
    "/airr/5.optimized.webp",
    "/airr/6.optimized.webp",
  ],
  galleryImageSrc: [
    "/airr/1.png",
    "/airr/2.png",
    "/airr/3.png",
    "/airr/4.png",
    "/airr/5.png",
    "/airr/6.png",
    "/airr/7.png",
  ],
  topics: [
    "typescript",
    "nodejs",
    "postgres",
    "react",
    "tailwind",
    "trpc",
    "vercel",
  ],
  setting: "work",
};

/** @type {Project} */
const PROJECT_SCREENSHOT_SERVICE = {
  title: "Screenshots as a Service",
  code: {
    t: "public",
    url: "https://github.com/crvouga/screenshot-service",
  },
  deployment: {
    t: "public",
    url: "https://screenshotservice.chrisvouga.dev",
  },
  description: `Software-as-a-Service platform enabling developers to programmatically generate high-quality screenshots of web pages. Provides reliable, scalable screenshot generation with customizable options. Powers the screenshot generation for this portfolio.`,
  imageAlt: IMAGE_ALT,
  imageSrc: ["/screenshot-service.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "lCEzYGJ0rN8",
      autoplay: true,
      mute: true,
    }),
    "/screenshot-service.png",
  ],
  topics: [
    "css",
    "heroku",
    "material-ui",
    "nodejs",
    "postgres",
    "puppeteer",
    "react",
    "react-query",
    "typescript",
    "supabase",
  ],
  setting: "side",
};

/** @type {Project} */
const PROJECT_ORCHARD = {
  title: "Orchard",
  code: {
    t: "private",
  },
  deployment: {
    t: "public",
    url: "https://asuorchard.asu.edu/",
  },
  description:
    "Educational platform developed by ASU that empowers instructors to create highly customizable assignments. Architected and implemented the LTI 1.3 integration with ASU's Learning Management System, enabling seamless single sign-on and grade passback functionality.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/orchard.optimized.webp"],
  galleryImageSrc: ["/orchard.png"],
  topics: ["php", "mysql", "drupal", "bootstrap", "javascript"],
  setting: "work",
};

/** @type {Project} */
const PROJECT_QUIZ_MAKER = {
  title: "LTI compatible quiz maker",
  code: {
    t: "public",
    url: "https://github.com/crvouga/quiz-maker",
  },
  deployment: {
    t: "not-deployed-anymore",
  },
  description:
    "LTI-compatible quiz creation platform that integrates seamlessly with Learning Management Systems. Enables instructors to build custom quizzes and assessments while providing students with a native LMS experience.",
  imageAlt: IMAGE_ALT,
  imageSrc: [],
  galleryImageSrc: [],
  topics: ["css", "express", "nodejs", "tailwind", "typescript", "vue"],
  setting: "side",
};

/** @type {Project} */
const PROJECT_COURIER_WEBSITE = {
  title: "Courier Company Website",
  deployment: {
    t: "public",
    url: "https://gps-couriers-website.vercel.app/",
  },
  code: {
    t: "private",
  },
  description: "Professional marketing website for a healthcare courier company, featuring responsive design, optimized performance, and clear communication of services to potential clients.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/courier.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "kFwPTJcM6I0",
      autoplay: true,
      mute: true,
    }),
    "/courier.png",
  ],
  topics: ["css", "material-ui", "nextjs", "react", "typescript"],
  setting: "work",
};

/** @type {Project} */
const PROJECT_ANIME_BLOG = {
  title: "Anime Blog",
  description: "Modern JAMstack blog built with Vue and Gridsome, featuring a headless CMS integration for content management. Demonstrates static site generation and performance optimization techniques.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/anime.optimized.webp"],
  galleryImageSrc: ["/anime.png"],
  topics: [
    "css",
    "javascript",
    "sanity",
    "vue",
    "bootstrap",
    "graphql",
    "gridsome",
  ],
  deployment: {
    t: "public",
    url: "https://anime.chrisvouga.dev/",
  },
  code: {
    t: "public",
    url: "https://github.com/crvouga/anime",
  },
  setting: "side",
};

/** @type {Project} */
const PROJECT_SNAKE_GAME = {
  title: "Smooth Snake Game",
  deployment: {
    t: "public",
    url: "https://snake.chrisvouga.dev/",
  },
  code: {
    t: "public",
    url: "https://github.com/crvouga/snake",
  },
  description:
    "Classic Snake game implemented using functional programming principles, featuring smooth animations and responsive controls. Showcases clean code architecture and modern React patterns.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/snake.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "7El3RdkzlHs",
      autoplay: true,
      mute: true,
    }),
    "/snake.png",
  ],
  topics: ["css", "javascript", "ramda", "react"],
  setting: "side",
};

/** @type {Project} */
const PROJECT_MATCH_THREE = {
  title: "Match Three",
  deployment: {
    url: "https://matchthree.chrisvouga.dev/",
    t: "public",
  },
  code: {
    t: "public",
    url: "https://github.com/crvouga/match-three",
  },
  description: "Match-three puzzle game inspired by Candy Crush, featuring engaging gameplay mechanics, smooth animations, and responsive design. Demonstrates game development skills and state management expertise.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/match-three.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "VBrlDgmXSoA",
      autoplay: true,
      mute: true,
    }),
    "/match-three.png",
  ],
  topics: ["css", "javascript", "ramda", "react", "redux", "redux-saga"],
  setting: "side",
};

/** @type {Project} */
const PROJECT_CHEESE = {
  title: "Cheese",
  deployment: {
    t: "not-deployed-anymore",
    // url: "https://cheese.chrisvouga.dev/",
  },
  code: {
    t: "public",
    url: "https://github.com/crvouga/cheese",
  },
  description:
    "Web application for generating customizable event identification cards with client-side image manipulation. Explores advanced browser APIs for image processing and demonstrates creative problem-solving in web development.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/cheese.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "hv3tRBHF7w4",
      autoplay: true,
      mute: true,
    }),
    "/cheese.png",
  ],
  topics: ["css", "typescript", "material-ui", "react", "firebase"],
  setting: "side",
};

/** @type {Project} */
const PROJECT_SIMON_SAYS = {
  title: "Simon Says",
  deployment: {
    t: "public",
    url: "https://simonsays.chrisvouga.dev/",
  },
  code: {
    t: "public",
    url: "https://github.com/crvouga/simon-says",
  },
  description: "Interactive implementation of the classic Simon Says memory game, featuring visual and audio feedback, progressive difficulty, and polished user interface design.",
  imageAlt: IMAGE_ALT,
  imageSrc: ["/simon-says.optimized.webp"],
  galleryImageSrc: [
    toYouTubeVideoUrl({
      youTubeVideoId: "WrUFzlKL0E0",
      autoplay: true,
      mute: true,
    }),
    "/simon-says.png",
  ],
  topics: ["css", "javascript", "ramda", "react", "redux", "redux-saga"],
  setting: "side",
};

/** @type {Project} */
const PROJECT_SMART_DOG_DOOR = {
  title: "Smart Dog Door",
  deployment: { t: "not-deployed-yet" },
  code: {
    t: "public",
    url: "https://github.com/crvouga/smart-dog-door-python",
  },
  description:
    "IoT smart door system that uses computer vision to automatically open for dogs and close when cats are detected. Integrates with smart home platforms for seamless automation, demonstrating expertise in embedded systems and machine learning applications.",
  imageAlt: IMAGE_ALT,
  imageSrc: [],
  galleryImageSrc: [],
  topics: ["python"],
  setting: "side",
};

/** @type {Project[]} */
export const PROJECTS = [
  PROJECT_NORMALIZER_APP,
  PROJECT_GAMEZILLA,
  PROJECT_TRIANGULATOR,
  PROJECT_STUDY_HALL,
  PROJECT_PICKFLIX,
  PROJECT_SUN_DEVILS,
  PROJECT_HEADLESS_COMBOBOX,
  PROJECT_MOVIEFINDER_RUST,
  PROJECT_TODO_APP,
  PROJECT_IMAGE_SERVICE,
  PROJECT_CONNECT_FOUR,
  PROJECT_AIRR,
  PROJECT_SCREENSHOT_SERVICE,
  PROJECT_SMART_DOG_DOOR,
  PROJECT_ORCHARD,
  PROJECT_QUIZ_MAKER,
  PROJECT_COURIER_WEBSITE,
  PROJECT_ANIME_BLOG,
  PROJECT_SNAKE_GAME,
  PROJECT_MATCH_THREE,
  PROJECT_SIMON_SAYS,
  PROJECT_CHEESE,
];

/** @type {Project[]} */
export const WORK_PROJECTS = PROJECTS.filter(
  (project) => project.setting === "work"
);

/** @type {Project[]} */
export const SIDE_PROJECTS = PROJECTS.filter(
  (project) => project.setting === "side"
);
