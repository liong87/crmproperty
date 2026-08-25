/**
 * Chart palette — the documented instance, derived from the app's own brand tokens.
 *
 * Every value here was produced by stepping the existing teal and amber to a lightness
 * and chroma that passes the palette validator, then verified rather than eyeballed.
 * Nothing in a chart may use a colour that is not in this file.
 *
 * Validated (light surface #ffffff):
 *
 *   FUNNEL_RAMP  ordinal, single hue, monotone lightness, adjacent ΔL >= 0.06,
 *                light end 2.55:1 vs surface.
 *   SERIES       categorical, all-pairs: worst ΔE 14.0 (protan) / 20.0 normal vision,
 *                chroma above floor, all three >= 3:1 vs surface.
 *   STATUS       WCAG text contrast on white: 5.3:1 to 7.1:1. Always shipped with a
 *                label, never colour alone.
 */

/**
 * Funnel stages are ORDERED — swapping them changes the meaning — so they take a
 * one-hue ramp rather than categorical hues, and the reader sees the sequence in the
 * colour. Darkest at the end, because the end is the goal.
 */
export const FUNNEL_RAMP = ["#35b3b1", "#26908e", "#1b6b69", "#124746"] as const;

/**
 * Categorical series identity, in FIXED order. Slot 1 is leads, 2 appointments,
 * 3 bookings — and that never changes with filtering, because a reader who learned
 * "bookings are plum" must not be retaught.
 */
export const SERIES = {
  leads: "#009794",
  appointments: "#b8850e",
  booked: "#6f43a0",
} as const;

/** Reserved for state. Never reused as a series colour. */
export const STATUS = {
  good: "#0f7a55",
  warning: "#8a6206",
  serious: "#a2521a",
  critical: "#a32d20",
} as const;

/** Chart chrome: one shade off the surface, solid hairlines, never dashed. */
export const CHROME = {
  grid: "#e7e4da",
  axis: "#d8d4c8",
  surface: "#ffffff",
} as const;
