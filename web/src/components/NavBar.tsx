import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

const LINKS = [
  { to: "/ladder", label: "Ladder", adminOnly: false },
  { to: "/matches", label: "Matches", adminOnly: false },
  { to: "/locations", label: "Locations", adminOnly: false },
  { to: "/admin/team", label: "Team", adminOnly: true },
  { to: "/admin/invites", label: "Invites", adminOnly: true },
];

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // Below the nav's breakpoint the links collapse behind a hamburger; above it this is ignored.
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // The open menu covers page content, so it needs the usual ways out of an overlay: Escape, or
  // a click anywhere outside it.
  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate("/");
  }

  const visibleLinks = LINKS.filter((link) => !link.adminOnly || user?.role === "ADMIN");

  return (
    <nav className="navbar" ref={navRef}>
      <span className="navbar-brand">Tennis Ladder</span>

      <button
        type="button"
        className="navbar-toggle"
        aria-label="Menu"
        aria-expanded={menuOpen}
        aria-controls="navbar-links"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
      </button>

      <div id="navbar-links" className={menuOpen ? "navbar-links is-open" : "navbar-links"}>
        {visibleLinks.map((link) => (
          <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)}>
            {link.label}
          </NavLink>
        ))}
        <button type="button" className="navbar-logout" onClick={() => handleLogout()}>
          Log out
        </button>
      </div>
    </nav>
  );
}
