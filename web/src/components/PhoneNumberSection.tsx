import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { SessionUserDto } from "@tennisladder/shared";
import {
  confirmPhoneVerification,
  removePhoneNumber,
  startPhoneVerification,
} from "../api/players.js";
import { ApiError } from "../api/client.js";
import { formatPhoneNumber } from "../lib/phone.js";
import { SMS_PROGRAM } from "../lib/legal.js";

/** The club is North American, so the country code starts here and is edited only when it isn't. */
const DEFAULT_COUNTRY_CODE = "+1";

interface PhoneNumberSectionProps {
  /** The user's confirmed number, or null if they haven't registered one. */
  phoneNumber: string | null;
  /** Called with the updated session user after a number is confirmed or removed. */
  onChange: (user: SessionUserDto) => void;
}

/**
 * Registering a number for notifications, in two steps: enter a number, then type back the code
 * that arrives by text. The number isn't attached to the account until that code is confirmed, so
 * a half-finished change leaves whatever was there before in place.
 */
export function PhoneNumberSection({ phoneNumber, onChange }: PhoneNumberSectionProps) {
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [nationalNumber, setNationalNumber] = useState("");
  const [code, setCode] = useState("");
  // Set once a code is on its way: the number we texted, which the confirm step is about.
  const [pendingNumber, setPendingNumber] = useState<string | null>(null);
  // Only meaningful while a number is already registered — the entry form is showing because the
  // user asked to change it, rather than because there's nothing there.
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function messageFor(err: unknown, fallback: string) {
    return err instanceof ApiError ? err.message : fallback;
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const started = await startPhoneVerification({
        phoneNumber: `${countryCode} ${nationalNumber}`,
      });
      setPendingNumber(started.phoneNumber);
      setCode("");
      setStatus(
        `We've texted a code to ${formatPhoneNumber(started.phoneNumber)}. ` +
          `It expires in ${started.expiresInMinutes} minutes.`,
      );
    } catch (err) {
      setError(messageFor(err, "Couldn't send a code to that number. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const updated = await confirmPhoneVerification({ code });
      onChange(updated);
      setPendingNumber(null);
      setChanging(false);
      setNationalNumber("");
      setCode("");
      setStatus("Your phone number is confirmed.");
    } catch (err) {
      setError(messageFor(err, "Couldn't confirm that code. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const updated = await removePhoneNumber();
      onChange(updated);
      setNationalNumber("");
      setStatus("Your phone number has been removed.");
    } catch (err) {
      setError(messageFor(err, "Couldn't remove your phone number. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  /** Backs out of the confirm step without touching the number already on the account. */
  function handleCancelVerification() {
    setPendingNumber(null);
    setCode("");
    setError(null);
    setStatus(null);
  }

  const showEntryForm = !pendingNumber && (!phoneNumber || changing);

  return (
    <section className="profile-phone">
      <h2>Phone number</h2>
      <p className="profile-section-hint">
        For match notifications by text. We'll send a code to confirm the number is yours. Only you
        can see it.
      </p>
      {/* The consent disclosure carriers want to see at the point a number is collected, and the
          screenshot the toll-free verification application is submitted with. What it says has to
          match the Terms and the Privacy Policy, so all three read from lib/legal.ts. */}
      <p className="profile-phone-consent">
        By adding a number you agree to receive {SMS_PROGRAM.DESCRIPTION}.{" "}
        {SMS_PROGRAM.FREQUENCY} {SMS_PROGRAM.RATES} {SMS_PROGRAM.OPT_OUT} {SMS_PROGRAM.HELP} See
        our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>. We never
        share your number for marketing.
      </p>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}

      {phoneNumber && !changing && !pendingNumber && (
        <div className="profile-phone-current">
          <p className="profile-phone-number">{formatPhoneNumber(phoneNumber)}</p>
          <div className="profile-phone-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setChanging(true);
                setStatus(null);
              }}
              disabled={busy}
            >
              Change
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={handleRemove}
              disabled={busy}
            >
              {busy ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      )}

      {showEntryForm && (
        <form className="profile-phone-form" onSubmit={handleSend}>
          <div className="profile-phone-fields">
            <div>
              <label htmlFor="profile-phone-country">Country code</label>
              <input
                id="profile-phone-country"
                className="profile-phone-country"
                inputMode="tel"
                autoComplete="tel-country-code"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="profile-phone-number">Phone number</label>
              <input
                id="profile-phone-number"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="555 123 4567"
                value={nationalNumber}
                onChange={(e) => setNationalNumber(e.target.value)}
              />
            </div>
          </div>
          <div className="profile-phone-actions">
            <button type="submit" disabled={busy || nationalNumber.trim() === ""}>
              {busy ? "Sending…" : "Send code"}
            </button>
            {changing && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setChanging(false);
                  setError(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {pendingNumber && (
        <form className="profile-phone-form" onSubmit={handleConfirm}>
          <label htmlFor="profile-phone-code">Confirmation code</label>
          <input
            id="profile-phone-code"
            className="profile-phone-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="profile-phone-actions">
            <button type="submit" disabled={busy || code.trim().length !== 6}>
              {busy ? "Confirming…" : "Confirm"}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={handleCancelVerification}
              disabled={busy}
            >
              Use a different number
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
