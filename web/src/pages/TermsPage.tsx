import { Link } from "react-router-dom";
import { LEGAL, SMS_PROGRAM } from "../lib/legal.js";

/**
 * Public, for the same reason the privacy policy is: a carrier reviewing the toll-free
 * verification application opens this URL directly.
 *
 * The "Text messages" section is the part they read. It has to name the program, state the
 * frequency, say that message and data rates may apply, give STOP and HELP, and link to the
 * privacy policy — a missing element is a rejection, so all of them come from lib/legal.ts and
 * agree with what the profile page says at the point a number is entered.
 */
export function TermsPage() {
  return (
    <article className="legal-page">
      <h1>Terms and Conditions</h1>
      <p className="legal-updated">Last updated {LEGAL.LAST_UPDATED}</p>

      <p>
        These terms cover your use of the Tennis Ladder run by {LEGAL.OPERATOR}. By using the site
        you agree to them.
      </p>

      <h2>Who this is for</h2>
      <p>
        The ladder is for members of the club. Accounts are created by redeeming an invite code
        from a club admin, and an admin can remove an account from the team.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your password to yourself and your details accurate. You are responsible for what
        happens under your account. Tell an admin if you think someone else has access to it.
      </p>

      <h2>Playing and reporting</h2>
      <p>
        Challenge, arrange and report matches honestly. Both players confirm a score before it
        counts, and points are awarded from the confirmed result. Admins may correct a result or
        call off a match where players cannot agree, and may adjust points. Their decision on a
        disputed match is final.
      </p>

      <h2>Being civil</h2>
      <p>
        Comments you leave while arranging a match are read by your opponent and by club admins.
        Don't post anything abusive, and don't use the ladder to contact other players about
        anything other than tennis. An admin may remove an account over this.
      </p>

      <h2>Text messages</h2>
      <p>
        Adding a phone number to your profile is optional and consents to receiving text messages
        from us. The program sends {SMS_PROGRAM.DESCRIPTION}. It is not a marketing program: we
        send nothing promotional.
      </p>
      <ul>
        <li>{SMS_PROGRAM.FREQUENCY}</li>
        <li>{SMS_PROGRAM.RATES}</li>
        <li>{SMS_PROGRAM.OPT_OUT}</li>
        <li>
          {SMS_PROGRAM.HELP} You can also email{" "}
          <a href={`mailto:${LEGAL.CONTACT_EMAIL}`}>{LEGAL.CONTACT_EMAIL}</a>.
        </li>
        <li>
          Carriers are not liable for delayed or undelivered messages, and delivery is not
          guaranteed.
        </li>
        <li>
          How we handle your number is set out in our <Link to="/privacy">Privacy Policy</Link>. It
          is never shared for marketing.
        </li>
      </ul>
      <p>
        Because notifications can be late or not arrive at all, treat them as a convenience: the
        match details on the site are what count.
      </p>

      <h2>Email</h2>
      <p>
        We email you about your own matches and about your account — invitations, password resets,
        confirming a score. These are part of running the ladder rather than something to
        unsubscribe from; to stop them, ask an admin to remove your account.
      </p>

      <h2>Availability</h2>
      <p>
        The ladder is run for the club's own use and is offered as it is. We don't promise it will
        always be available or free of faults, and travel times, weather forecasts and driving
        estimates are drawn from third-party services and are indications only — check the
        conditions and leave yourself time.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, {LEGAL.OPERATOR} is not liable for any loss arising from your
        use of the site, including a missed match, a message that didn't arrive, or a journey
        planned from an estimate here. Nothing in these terms limits liability that cannot legally
        be limited. You play tennis at your own risk.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms; the date at the top of this page shows when they last changed.
        Continuing to use the ladder after a change means accepting it.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of {LEGAL.GOVERNING_LAW}.</p>

      <h2>Contact</h2>
      <p>
        Questions go to <a href={`mailto:${LEGAL.CONTACT_EMAIL}`}>{LEGAL.CONTACT_EMAIL}</a>.
      </p>

      <p className="legal-footer-links">
        <Link to="/privacy">Privacy Policy</Link> · <Link to="/">Back to the ladder</Link>
      </p>
    </article>
  );
}
