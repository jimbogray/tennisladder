import { Link } from "react-router-dom";
import { LEGAL } from "../lib/legal.js";

/**
 * Shown on every page, signed in or out. Carriers reviewing a messaging application check that
 * the privacy policy and terms are reachable from the site itself, not only from the URLs on the
 * form, so these links belong somewhere permanent rather than on the profile page alone.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link to="/privacy">Privacy Policy</Link>
      <Link to="/terms">Terms and Conditions</Link>
      <span className="site-footer-operator">© {LEGAL.OPERATOR}</span>
    </footer>
  );
}
