import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { Avatar } from "./Avatar.js";

/** The signed-in user's own menu: their portrait in the navbar, opening Profile and Log out. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Same ways out as the navbar's own menu: Escape, or a click anywhere outside.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  if (!user) return null;

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate("/");
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className="user-menu-trigger"
        aria-label={`Account menu for ${user.firstName} ${user.lastName}`}
        aria-expanded={open}
        aria-controls="user-menu-panel"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} />
      </button>

      {open ? (
        <div id="user-menu-panel" className="user-menu-panel">
          <div className="user-menu-identity">
            <strong>
              {user.firstName} {user.lastName}
            </strong>
            <span>{user.email}</span>
          </div>
          <Link to="/profile" onClick={() => setOpen(false)}>
            Profile
          </Link>
          <button type="button" className="user-menu-logout" onClick={() => handleLogout()}>
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
