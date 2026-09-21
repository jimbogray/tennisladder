import { Link } from "react-router-dom";
import { LEGAL, SMS_PROGRAM } from "../lib/legal.js";

/**
 * Public, and deliberately reachable without signing in: carriers reviewing the toll-free
 * verification application open this URL directly, and so do players deciding whether to give us
 * a phone number.
 *
 * The section on text messages carries language the carriers require verbatim in substance — that
 * opt-in data and phone numbers are never shared for marketing. Don't soften it, and don't add a
 * general "we may share data with partners" clause anywhere on this page: either one fails the
 * application outright.
 */
export function PrivacyPolicyPage() {
  return (
    <article className="legal-page">
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated {LEGAL.LAST_UPDATED}</p>

      <p>
        This policy explains what {LEGAL.OPERATOR} collects when you use the Tennis Ladder, why,
        and who it is shared with. It applies to this site and the notifications we send you.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account</strong> — your name, email address, and either a password (stored
          only as a hash, never in a form we can read) or the fact that you signed in with Google.
        </li>
        <li>
          <strong>Your playing details</strong> — your USTA/NTRP rating if you give one, your
          position and points on the ladder, and your match history.
        </li>
        <li>
          <strong>Your matches</strong> — the times, courts and comments you and your opponent
          exchange while arranging a match, and the scores reported afterwards.
        </li>
        <li>
          <strong>Your phone number</strong>, if you choose to add one for text notifications. This
          is optional, and the ladder works without it.
        </li>
        <li>
          <strong>Addresses you save</strong> for working out travel times to matches, along with
          the coordinates we look up for them.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To run the ladder: to sign you in, to show the standings, to let players challenge and
        arrange matches with each other, to record results, and to send you notifications about
        your own matches. We do not use your information to advertise to you, and we do not sell
        it.
      </p>

      <h2>Text messages</h2>
      <p>
        If you add a phone number, we text you {SMS_PROGRAM.DESCRIPTION}.{" "}
        {SMS_PROGRAM.FREQUENCY} {SMS_PROGRAM.RATES} {SMS_PROGRAM.OPT_OUT} {SMS_PROGRAM.HELP}
      </p>
      <p>
        <strong>
          No mobile information is sold, shared, rented, released or traded with third parties or
          affiliates for marketing or promotional purposes. Text messaging originator opt-in data
          and consent are excluded from all sharing: this information will not be shared with any
          third parties.
        </strong>{" "}
        Your phone number reaches our messaging provider only so that it can deliver the message
        you asked for, and for no other purpose.
      </p>

      <h2>What other players and admins can see</h2>
      <p>
        Other players see your name, rating, ladder position and match results. They do not see
        your email address, your phone number or your saved addresses. Club admins can see your
        email address and account type so they can run the team, but not your phone number or your
        saved addresses. Match emails are sent from a single club address so players' own addresses
        are never exposed to each other.
      </p>

      <h2>Services we rely on</h2>
      <p>
        We use a small number of providers to run the site. They process information on our behalf
        and only as far as their part of the job needs:
      </p>
      <ul>
        <li>
          <strong>Microsoft Azure</strong> — hosting and the database, and delivering our email and
          text messages. Your phone number is shared here, and only here, to send you the messages
          you asked for.
        </li>
        <li>
          <strong>Google</strong> — sign-in, if you choose it, and address autocomplete and maps in
          your browser.
        </li>
        <li>
          <strong>OpenStreetMap (Nominatim)</strong> — turning a court or saved address into
          coordinates.
        </li>
        <li>
          <strong>Open-Meteo</strong> and <strong>OSRM</strong> — the weather forecast for a court,
          and driving times, from those coordinates.
        </li>
      </ul>
      <p>
        Apart from these, we share your information with nobody. We do not sell it, rent it, or
        trade it, to anyone, for any purpose.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          <strong>Your account</strong> — for as long as you are on the team, and after you leave
          until you ask for it to be erased.
        </li>
        <li>
          <strong>Your matches, and the messages you sent arranging them</strong> — kept with your
          account, because they are the ladder's record and the other player's record too.
        </li>
        <li>
          <strong>Your phone number</strong> — until you remove it, which deletes it straight away.
          A number still being confirmed, and its code, are deleted within minutes.
        </li>
        <li>
          <strong>Addresses you save</strong> — the address itself is never kept at all. It is
          turned into map coordinates while you are saving it and then thrown away, and the
          coordinates are deleted when you remove the place or your account is erased.
        </li>
        <li>
          <strong>Sign-in sessions, password-reset links, invite codes and result links</strong> —
          all short-lived and expire on their own; a reset link lasts about an hour, an invite code
          a couple of days, and a signed-in session weeks at most. Logging out ends yours
          immediately.
        </li>
      </ul>

      <h2>Getting a copy, and having it erased</h2>
      <p>
        Your profile page has a button that downloads everything we hold about you as a file, at any
        time and without asking anyone.
      </p>
      <p>
        To have it erased, ask a club admin, or email us at{" "}
        <a href={`mailto:${LEGAL.CONTACT_EMAIL}`}>{LEGAL.CONTACT_EMAIL}</a>. Erasing deletes your
        name, email address, rating, phone number, saved places and everything you have typed, and
        it cannot be undone.
      </p>
      <p>
        Two things survive it, and only because they are not only about you. The matches you have
        played stay on record, with a placeholder in place of your name, so the players you played
        against keep their own history and the ladder standings still add up. The points those
        matches awarded stay for the same reason. Nothing in what is left identifies you.
      </p>

      <h2>Security</h2>
      <p>
        The site is served over HTTPS. Passwords are stored hashed, sign-in tokens are short-lived,
        and confirmation codes are stored hashed, expire, and are limited in how often they can be
        requested or guessed.
      </p>

      <h2>Children</h2>
      <p>
        The ladder is for club members. If a player under 13 is registered, a parent or guardian
        should set the account up and give any consent on their behalf.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes we will update the date at the top of this page, and tell you if the
        change affects how we use your information.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy, or about what we hold on you, go to{" "}
        <a href={`mailto:${LEGAL.CONTACT_EMAIL}`}>{LEGAL.CONTACT_EMAIL}</a>.
      </p>

      <p className="legal-footer-links">
        <Link to="/terms">Terms and Conditions</Link> · <Link to="/">Back to the ladder</Link>
      </p>
    </article>
  );
}
