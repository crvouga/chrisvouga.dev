/**
 * @param {string} href
 * @param {string} text
 * @returns {string}
 */
const a = (href, text) => {
  return `<a style="color: white;" target="_blank" rel="noreferrer noopener" href="${href}">${text}</a>`;
};

const bandHref = "https://www.instagram.com/tripolartheband/";

const lamderaHref = "https://lamdera.com/";

/**
 * @type {import("./work.js").Work[]}
 */
const work = [
  {
    name: "One Origin",
    infoUrl: "https://oneorigin.us/",
    jobTitle: "Senior Software Developer",
    jobDescription: `Working as a full-stack software developer. Guiding junior developers. Developing products for clients at ASU`,
    yearStart: 2022,
    yearEnd: "Present",
  },
  {
    name: "Freelancing",
    jobTitle: "Frontend Developer",
    jobDescription: `Worked as a freelance frontend developer for a couple of years. Primarily developed static sites for small businesses`,
    yearStart: 2020,
    yearEnd: 2022,
  },
];

/**
 * @type {import("./education.js").Education[]}
 */
const education = [
  {
    degree: "Bachelor of Science in Mathematics & Statistics",
    institutionName: "Arizona State University",
    yearEnd: 2020,
    yearStart: 2016,
    infoUrl: "https://www.asu.edu/",
    imageAlt: "Diploma",
    imageSrc: "/diploma.optimized.webp",
  },
];

/**
 * @type {import("./project.js").Project[]}
 */
const workProjects = [
  {
    title: "Triangulator",
    deployment: { t: "private" },
    code: { t: "private" },
    description:
      "Triangulator is a product developed by ASU that automates the process of determining course transfers between universities. My contributions include being one of the leading developers on the project.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/triangulator.optimized.webp"],
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
    ],
  },
  {
    title: "Study Hall",
    deployment: {
      t: "public",
      url: "https://gostudyhall.com/",
    },
    code: {
      t: "private",
    },
    description:
      "Study Hall is an education platform created by the Study Hall YouTube channel and ASU. My contributions include refactoring the payment system to increase reliability.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/studyhall.optimized.webp"],
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
  },
  {
    title: "Sun devils",
    deployment: { t: "public", url: "https://sundevils.com/" },
    code: { t: "private" },
    description:
      "The official website for the ASU Sun Devils. My contributions include developing interactive React components like the upcoming game feed and news feed.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/sun-devils.optimized.webp"],
    topics: ["bootstrap", "drupal", "javascript", "react", "css", "php"],
  },
  {
    title: "Orchard",
    code: {
      t: "private",
    },
    deployment: {
      t: "public",
      url: "https://asuorchard.asu.edu/",
    },
    description:
      "Orchard is a learning tool developed by ASU that enables teachers to create highly customizable assignments for their students. My contributions include integrating Orchard with ASU's LMS using LTI 1.3.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/orchard.optimized.webp"],
    topics: ["php", "mysql", "drupal", "bootstrap", "javascript"],
  },
  {
    title: "Airr Product Demo",
    code: {
      t: "private",
    },
    deployment: {
      t: "public",
      url: "https://experience-airr.heysia.ai/",
    },
    description:
      "A product demo for Airr. A product offered by One Origin to automate the process of consuming transcripts.",
    imageAlt: "project screenshot or video",
    imageSrc: [
      "/airr/1.optimized.webp",
      "/airr/2.optimized.webp",
      "/airr/3.optimized.webp",
      "/airr/4.optimized.webp",
      "/airr/5.optimized.webp",
      "/airr/6.optimized.webp",
      "/airr/7.optimized.webp",
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
  },
  {
    title: "Courier Company Website",
    deployment: {
      t: "public",
      url: "https://gps-couriers-website.vercel.app/",
    },
    code: {
      t: "private",
    },
    description: "A marketing website for a hospice courier company.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/courier.optimized.webp"],
    youTubeVideoId: "kFwPTJcM6I0",
    topics: ["css", "material-ui", "nextjs", "react", "typescript"],
  },
];

const gamezillaHref = "https://www.gamezilla.app/";
/**
 * @type {import("./project.js").Project[]}
 */
const sideProjects = [
  {
    title: "gamezilla.app",
    deployment: {
      t: "public",
      url: gamezillaHref,
    },
    code: {
      t: "private",
    },
    description: `${a(
      gamezillaHref,
      "gamezilla.app"
    )} is a work-in-progress multiplayer gaming app. Implemented using a full-stack variant of the Elm architecture in TypeScript. Copied from the ${a(
      lamderaHref,
      "Lamdera"
    )} platform.`,
    imageAlt: "project screenshot or video",
    imageSrc: ["/gamezilla.optimized.webp"],
    youTubeVideoId: "VSLpdPvHbD4",
    topics: ["typescript", "react", "postgres", "tailwind", "websocket", "bun"],
  },

  {
    title: "moviefinder.app",
    deployment: {
      t: "public",
      url: "https://www.moviefinder.app/",
    },
    code: {
      t: "public",
      url: "https://github.com/crvouga/moviefinder.app",
    },
    description: "A work-in-progress movie search app with a tiktok-like UI.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/moviefinder-app.optimized.webp"],
    topics: ["rust", "tailwind", "postgres", "datastar"],
  },

  {
    title: "headless-combobox",
    deployment: {
      t: "public",
      url: "https://www.npmjs.com/package/headless-combobox",
    },
    code: {
      t: "public",
      url: "https://github.com/crvouga/headless-combobox",
    },
    imageAlt: "project screenshot or video",
    imageSrc: [
      "https://github.com/crvouga/headless-combobox/raw/main/demo.gif",
    ],
    description: `Purely functional, headless, framework-agnostic, zero dependency, accessible, TypeScript combobox library. Used to create comboboxes in any UI framework.`,
    topics: ["typescript"],
  },

  {
    title: "Pickflix",
    deployment: {
      t: "not-deployed-anymore",
      // url: "https://crvouga-pickflix.herokuapp.com/",
    },
    code: {
      t: "public",
      url: "https://github.com/crvouga/pickflix-v1",
    },
    description:
      "Watch trailers, write reviews and make movie lists with your friends.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/pickflix.optimized.webp"],
    youTubeVideoId: "-atthbuMFIM",
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
  },

  {
    title: "Fullstack Todo App",
    code: {
      t: "public",
      url: "https://github.com/crvouga/todo",
    },
    deployment: {
      t: "not-deployed-anymore",
      // url: "https://todo.chrisvouga.dev",
    },
    description: "Fullstack todo app. Sign in and start tracking things todo.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/todo.optimized.webp"],
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
  },

  {
    title: "Screenshots as a Service",
    code: {
      t: "public",
      url: "https://github.com/crvouga/screenshot-service",
    },
    deployment: {
      t: "not-deployed-anymore",
      // url: "https://screenshotservice.chrisvouga.dev",
    },
    description: `A software-as-a service app that lets developers generate screenshots for their websites. It was used for this website.`,
    imageAlt: "project screenshot or video",
    imageSrc: ["/screenshot-service.optimized.webp"],
    youTubeVideoId: "lCEzYGJ0rN8",
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
  },

  {
    title: "LTI compatible quiz maker",
    code: {
      t: "public",
      url: "https://github.com/crvouga/quiz-maker",
    },
    deployment: {
      t: "not-deployed-anymore",
    },
    description:
      "This app was built to serve as an example of LTI-compatible apps. The app itself is a quiz maker app where instructors can create quizzes and students can take them all inside of a hosting LMS.",
    imageAlt: "project screenshot or video",
    imageSrc: [],
    topics: ["css", "express", "nodejs", "tailwind", "typescript", "vue"],
  },

  {
    title: "Band Website with E-commerce",
    deployment: {
      t: "public",
      url: "https://thebandalibi.chrisvouga.dev/",
    },
    code: {
      t: "public",
      url: "https://github.com/crvouga/thebandalibi-com",
    },
    description:
      "The official website and e-commerce store for the band alibi.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/band.optimized.webp"],
    youTubeVideoId: "vChYAGXsLuI",
    topics: [
      "css",
      "firebase",
      "material-ui",
      "nextjs",
      "react-query",
      "react",
      "sanity",
      "shopify",
      "typescript",
    ],
  },

  {
    title: "Anime Blog",
    description: "A jamstack blog about anime.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/anime.optimized.webp"],
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
  },

  {
    title: "Multiplayer Connect Four",
    deployment: {
      t: "public",
      url: "https://connectfour.chrisvouga.dev/",
    },
    code: {
      t: "public",
      url: "https://github.com/crvouga/connect-four",
    },
    description: "Play the game Connect Four online with your friends",
    imageAlt: "project screenshot or video",
    imageSrc: ["/connect-four.optimized.webp"],
    youTubeVideoId: "9_TbyftkaQw",
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
  },

  {
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
      "Pure functional implementation of the classic game Snake with smooth snake movement",
    imageAlt: "project screenshot or video",
    imageSrc: ["/snake.optimized.webp"],
    youTubeVideoId: "7El3RdkzlHs",
    topics: ["css", "javascript", "ramda", "react"],
  },

  {
    title: "Match Three",
    deployment: {
      url: "https://matchthree.chrisvouga.dev/",
      t: "public",
    },
    code: {
      t: "public",
      url: "https://github.com/crvouga/match-three",
    },
    description: "Match Three is a Candy Crush type game",
    imageAlt: "project screenshot or video",
    imageSrc: ["/match-three.optimized.webp"],
    youTubeVideoId: "VBrlDgmXSoA",
    topics: ["css", "javascript", "ramda", "react", "redux", "redux-saga"],
  },

  {
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
      "Cheese is an app that lets people make fake GCU ids so they can sneak into GCU events.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/cheese.optimized.webp"],
    youTubeVideoId: "hv3tRBHF7w4",
    topics: ["css", "typescript", "material-ui", "react", "firebase"],
  },

  {
    title: "Simon Says",
    deployment: {
      t: "public",
      url: "https://simonsays.chrisvouga.dev/",
    },
    code: {
      t: "public",
      url: "https://github.com/crvouga/simon-says",
    },
    description: "An implementation of the classic memory game Simon Says.",
    imageAlt: "project screenshot or video",
    imageSrc: ["/simon-says.optimized.webp"],
    youTubeVideoId: "WrUFzlKL0E0",
    topics: ["css", "javascript", "ramda", "react", "redux", "redux-saga"],
  },

  {
    title: "Image resizer service",
    code: {
      t: "public",
      url: "https://github.com/crvouga/imageresizerservice.com",
    },
    deployment: {
      t: "public",
      url: "https://www.imageresizerservice.com/",
    },
    description: `A zero dependency image resizer service. Used to optimize images for web apps. Made to be self-hosted.`,
    imageAlt: "project screenshot or video",
    imageSrc: [],
    topics: ["go", "sqlite"],
  },
];

const aboutMe = `
I'm a software developer living in the Phoenix Valley.
I graduated from ASU with a bachelor's degree in mathematics and statistics.
Software development is also a hobby for me. I enjoy consuming technical content regularly and developing apps in my free time.
Right now, I'm primarily doing web development, but I would be interested in other types of development like native or embedded.
A fun fact about me is that I play the drums in a ${a(bandHref, "band")}.`;

const metaDescription = aboutMe.replace(a(bandHref, "band"), "band");

//
//
//
//
//
//
//

export const data = {
  siteSourceCodeUrl: "https://github.com/crvouga/chrisvouga.dev",

  screenshotServiceProjectId: "3e158ff9-0b37-41d1-84d0-cae1397adf4b",

  metaTitle: "Chris Vouga • Software Developer",

  metaDescription: metaDescription,

  emailAddress: "crvouga@gmail.com",

  Github: {
    url: "https://github.com/crvouga",
  },

  Linkedin: {
    url: "https://www.linkedin.com/in/chris-vouga",
  },

  aboutMe,

  phoneNumber: "4802098698",

  sideProjects,

  workProjects,

  work,

  education,
};
