import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <nav>
      <NavLink to="/ladder">Ladder</NavLink>
      <NavLink to="/matches">Matches</NavLink>
      <NavLink to="/locations">Locations</NavLink>
      {user?.role === "ADMIN" && (
        <NavLink to="/admin/registration-codes">Registration Codes</NavLink>
      )}
      <button type="button" onClick={() => handleLogout()}>
        Log out
      </button>
    </nav>
  );
}
