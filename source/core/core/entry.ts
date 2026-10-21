/**
 * The one place the entry of a function's bundle is named, so no build kit,
 * pack kit or deploy kit spells it out for itself: a build kit builds
 * `SOURCE` (in an app's or an integration's folder) into `BUNDLE`, and a
 * deploy kit runs `BUNDLE`, whose default export answers `fetch(request,
 * env)` (`function.v1`'s own contract).
 */
export const SOURCE = "main.ts";
export const BUNDLE = "main.js";
/** What a deploy kit calls in a native bundle (`NATIVE`): the platform's own handler, exported by `BUNDLE`. */
export const HANDLER = "handler";
/**
 * Written beside `BUNDLE` when an integration has a folder of its own: its
 * entry speaks the platform's native interface, not `function.v1`'s, so a
 * deploy kit runs it as it is instead of adapting it. The build writes it and
 * every zip of the output carries it.
 */
export const NATIVE = "main.native";
