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
    jobDescription: `Full-stack software developer leading development of client products for ASU. Mentoring junior developers and contributing to technical decision-making.`,
    yearStart: 2022,
    yearEnd: "Present",
  },
  {
    name: "Freelancing",
    jobTitle: "Frontend Developer",
    jobDescription: `Freelance frontend developer specializing in static site development for small businesses.`,
    yearStart: 2020,
    yearEnd: 2022,
  },
];
