/**
 * @typedef {{
 * infoUrl?: string;
 * institutionName: string;
 * degree: string;
 * yearStart: number;
 * yearEnd: number | "Present";
 * imageSrc: string;
 * imageAlt: string;
 * galleryImageSrc: string[];
 * }} School
 */

/**
 * @type {import("./school.js").School[]}
 */
export const SCHOOL = [
  {
    degree: "Bachelor of Science in Mathematics & Statistics",
    institutionName: "Arizona State University",
    yearEnd: 2020,
    yearStart: 2015,
    infoUrl: "https://www.asu.edu/",
    imageAlt: "Diploma",
    imageSrc: "/diploma.optimized.webp",
    galleryImageSrc: ["/diploma.jpg"],
  },
];
