/**
 * Auth middleware — framework integration boundary for Clerk.
 * Public routes: marketing home, auth pages, and public lead-capture APIs/webhooks.
 * Everything else requires a session.
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * MACHINE ENDPOINTS — the exact list.
 *
 * Everything here is called by Meta's servers, not by a browser, and therefore has no
 * Clerk session and never will. Each one authenticates itself: the webhook by its verify
 * token and payload signature, the two callbacks by Facebook's `signed_request`. Sending
 * them through `auth.protect()` does not make them safer, it just makes Meta receive a
 * redirect to a sign-in page and mark the callback as failing.
 *
 * This same list is what must be allowed past Cloudflare Access at the edge. If the two
 * lists ever drift apart, leads stop arriving with no error anywhere in the app — so
 * they are written down together, here, on purpose.
 *
 * `/api/auth/facebook/start` and `/callback` are deliberately NOT here: those run in an
 * agent's own browser and need the session.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/public/(.*)",
  "/api/webhooks/(.*)",
  "/api/auth/facebook/deauthorize",
  "/api/auth/facebook/data-deletion",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files, but always run for API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
