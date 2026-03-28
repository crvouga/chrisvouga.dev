export type School = {
  infoUrl?: string;
  institutionName: string;
  degree: string;
  yearStart: number;
  yearEnd: number | "Present";
  imageSrc: string;
  imageAlt: string;
  galleryImageSrc: string[];
};

export const SCHOOL: School[] = [
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
