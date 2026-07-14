import { Outlet } from "react-router-dom";
import { NavBar } from "./NavBar.js";

export function Layout() {
  return (
    <div>
      <NavBar />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
