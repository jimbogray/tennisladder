import { Outlet } from "react-router-dom";
import { NavBar } from "./NavBar.js";
import { SiteFooter } from "./SiteFooter.js";

export function Layout() {
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
