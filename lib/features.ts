/**
 * Feature switches.
 *
 * Commission is BUILT and its arithmetic is verified — schemes, setter/closer/agency/
 * co-broke splits, staged release, 8,000 allocations tested for lost cents. What is not
 * settled is the agency's actual formula, and a commission screen showing confident
 * numbers from a rate nobody has agreed is worse than no screen: somebody will quote
 * one to an agent.
 *
 * So it is hidden, not removed. The engine, the tables and the data all stay; only the
 * ways in are closed. Set FEATURE_COMMISSION=1 as a Worker secret to open them again —
 * no code change, no migration, and nothing recorded in the meantime is lost.
 */
export const COMMISSION_ENABLED = process.env.FEATURE_COMMISSION === "1";
