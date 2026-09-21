import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { resolveResultToken, submitResultViaToken } from "../api/results.js";
import type { ResultOutcome } from "@tennisladder/shared";

export function ResultConfirmPage() {
  const { token } = useParams<{ token: string }>();
  const [outcome, setOutcome] = useState<ResultOutcome | null>(null);
  const [status, setStatus] = useState<"pending" | "resolved" | "submitted" | "error">("pending");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    resolveResultToken(token)
      .then((res) => {
        setOutcome(res.outcome);
        setStatus("resolved");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  async function confirm() {
    setSubmitError(null);
    try {
      await submitResultViaToken(token!);
      setStatus("submitted");
    } catch (error) {
      // The link can go stale between loading this page and pressing the button — the other
      // player may have settled the match in the meantime.
      setSubmitError(error instanceof Error ? error.message : "Something went wrong. Try again.");
    }
  }

  if (status === "pending") return <p>Loading…</p>;
  if (status === "error") return <p>This link is invalid or has already been used.</p>;
  if (status === "submitted") return <p>Recorded — thanks!</p>;

  return (
    <div>
      <h1>Confirm result</h1>
      <p>You're reporting: {outcome === "WON" ? "you won" : "you lost"}</p>
      <button type="button" onClick={confirm}>
        Confirm
      </button>
      {submitError ? <p role="alert">{submitError}</p> : null}
    </div>
  );
}
