/**
 * @typedef {{
 * name: string;
 * infoUrl?: string;
 * jobTitle: string;
 * jobDescription: string;
 * yearStart: number;
 * yearEnd: number | "Present";
 * }} Work
 */

/**
 * @type {import("./work.js").Work[]}
 */
export const WORK = [
  {
    name: "One Origin",
    infoUrl: "https://oneorigin.us/",
    jobTitle: "Senior Software Developer",
    jobDescription: `Lead full-stack development of enterprise software products for Arizona State University, including complex data processing platforms and educational tools. Architect scalable solutions using modern technologies, mentor junior developers, and drive technical decision-making to deliver high-quality products on time.`,
    yearStart: 2022,
    yearEnd: "Present",
  },
  {
    name: "Freelancing",
    jobTitle: "Frontend Developer",
    jobDescription: `Delivered custom web solutions for small businesses, focusing on responsive design, performance optimization, and user experience. Built static sites and web applications that helped clients establish and grow their online presence.`,
    yearStart: 2020,
    yearEnd: 2022,
  },
];
