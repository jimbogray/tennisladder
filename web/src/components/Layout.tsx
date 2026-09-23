import { Outlet } from "react-router-dom";
import { NavBar } from "./NavBar.js";
import { SiteFooter } from "./SiteFooter.js";
import { useLiveUpdates } from "../hooks/useLiveUpdates.js";

export function Layout() {
  // Here rather than per page: one connection for the whole signed-in app, kept open across
  // navigation, and only while someone is signed in (RequireAuth wraps this layout).
  useLiveUpdates();

  return (
    <div className="app-shell">
      <NavBar />
      <main className="page-content">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
