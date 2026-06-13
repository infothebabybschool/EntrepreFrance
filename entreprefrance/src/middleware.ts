import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { ADMIN_USER_IDS } from "@/lib/admin";

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);
const isAccountRoute = createRouteMatcher(["/mon-compte(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      await auth.protect();
      return;
    }
    if (!ADMIN_USER_IDS.includes(userId)) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  if (isAccountRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      await auth.protect();
      return;
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
