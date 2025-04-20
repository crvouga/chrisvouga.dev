import { ABOUT_ME, ABOUT_ME_ATTR_SAFE } from "./about.js";
import { PROJECTS, SIDE_PROJECTS, WORK_PROJECTS } from "./project.js";
import { SCHOOL } from "./school.js";
import { WORK } from "./work.js";

const PAGE_TITLE = "Chris Vouga";

const PAGE_SUBTITLE = "Software Developer";

export const CONTENT = {
  SITE_SOURCE_CODE_URL: "https://github.com/crvouga/chrisvouga.dev",
  SCREENSHOT_SERVICE_PROJECT_ID: "3e158ff9-0b37-41d1-84d0-cae1397adf4b",
  PAGE_TITLE,
  PAGE_SUBTITLE,
  META_TITLE: `${PAGE_TITLE} • ${PAGE_SUBTITLE}`,
  META_DESCRIPTION: ABOUT_ME_ATTR_SAFE,
  EMAIL_ADDRESS: "crvouga@gmail.com",
  GITHUB_URL: "https://github.com/crvouga",
  LINKEDIN_URL: "https://www.linkedin.com/in/chris-vouga",
  PHONE_NUMBER: "4802098698",
  PROJECT_SECTION_TITLE: "Projects",
  PROJECTS,
  SIDE_PROJECTS,
  WORK_PROJECTS,
  WORK_SECTION_TITLE: "Work",
  WORK,
  ABOUT_ME_SECTION_TITLE: "About Me",
  ABOUT_ME,
  SCHOOL_SECTION_TITLE: "Education",
  SCHOOL,
  CONTACT_SECTION_TITLE: "Contact",
};
