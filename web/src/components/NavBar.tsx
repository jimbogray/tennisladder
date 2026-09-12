import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

const LINKS = [
  { to: "/ladder", label: "Ladder", adminOnly: false },
  { to: "/matches", label: "Matches", adminOnly: false },
  { to: "/locations", label: "Locations", adminOnly: false },
  { to: "/admin/invites", label: "Invites", adminOnly: true },
];

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // Below the nav's breakpoint the links collapse behind a hamburger; above it this is ignored.
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate("/");
  }

  const visibleLinks = LINKS.filter((link) => !link.adminOnly || user?.role === "ADMIN");

  return (
    <nav className="navbar">
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
