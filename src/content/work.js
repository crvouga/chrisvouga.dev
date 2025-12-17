/**
 * @typedef {{
 * name: string;
 * infoUrl?: string;
 * jobTitle: string;
 * jobDescription: string;
 * yearStart: number;
 * yearEnd: number | "Present";
 * imageSrc: string[];
 * imageAlt: string;
 * galleryImageSrc: string[];
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
    imageSrc: ["/one-origin/2025-q1-award-1-enhanced-with-ai.optimized.webp"],
    imageAlt: "One Origin award certificates",
    galleryImageSrc: [
      // "/one-origin/2025-q1-award-1.jpg",
      "/one-origin/2025-q1-award-1-enhanced-with-ai.png",
      // "/one-origin/2025-q1-award-2.jpg",
      // "/one-origin/2025-q1-award-3.jpg",
      // "/one-origin/2025-q1-award-4.jpg",
      // "/one-origin/2024-q3-&-q4-award-1.jpg",
      "/one-origin/2024-q3-&-q4-award-1-enhanced-with-ai.png",
      // "/one-origin/2024-q3-&-q4-award-2.jpg",
      "/one-origin/2024-q2-award-1.jpg",
      "/one-origin/2024-q1-award-1.jpg",
      "/one-origin/desk.jpg",
    ],
  },
  {
    name: "Freelancing",
    jobTitle: "Solo Software Developer",
    jobDescription: `Delivered custom web solutions for small businesses, focusing on responsive design, performance optimization, and user experience. Built static sites and web applications that helped clients establish and grow their online presence.`,
    yearStart: 2020,
    yearEnd: 2022,
    imageSrc: [],
    imageAlt: "",
    galleryImageSrc: [],
  },
];
