/** Lowercase words joined by hyphens, e.g. "dhaka", "dhaka-mirpur", "green-chilli". */
export const CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A Bangladesh mobile number in international form, e.g. +8801712345678. */
export const BD_MOBILE_PATTERN = /^\+8801[3-9]\d{8}$/;
