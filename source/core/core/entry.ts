/**
 * The one place the entry of a function's bundle is named, so no build kit,
 * pack kit or deploy kit spells it out for itself: a build kit builds
 * `SOURCE` (in an app's or an integration's folder) into `BUNDLE`, and a
 * deploy kit runs `BUNDLE`, whose default export answers `fetch(request,
 * env)` (`function.v1`'s own contract).
 */
export const SOURCE = "main.ts";
export const BUNDLE = "main.js";
