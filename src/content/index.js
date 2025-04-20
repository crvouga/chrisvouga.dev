import { projects } from "./project.js";

/**
 * @param {string} href
 * @param {string} text
 * @returns {string}
 */
const a = (href, text) => {
  return `<a style="color: white;" target="_blank" rel="noreferrer noopener" href="${href}">${text}</a>`;
};

const bandHref = "https://www.instagram.com/tripolartheband/";

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

/**
 * @type {import("./project.js").Project[]}
 */
const workProjects = projects.filter((project) => project.setting === "work");

/**
 * @type {import("./project.js").Project[]}
 */
const sideProjects = projects.filter((project) => project.setting === "side");

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

  projects,

  sideProjects,

  workProjects,

  work,

  education,
};
