import { a } from "./a.js";

const BAND_HREF = "https://www.instagram.com/tripolartheband/";
const BAND_A_TAG = a(BAND_HREF, "band");

export const ABOUT_ME = `
I'm a software developer living in the Phoenix Valley.
I graduated from ASU with a bachelor's degree in mathematics and statistics.
Software development is also a hobby for me. I enjoy consuming technical content regularly and developing apps in my free time.
Right now, I'm primarily doing web development, but I would be interested in other types of development like native or embedded.
A fun fact about me is that I play the drums in a ${BAND_A_TAG}.`;

export const ABOUT_ME_ATTR_SAFE = ABOUT_ME.replace(BAND_A_TAG, "band");
