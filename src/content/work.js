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
