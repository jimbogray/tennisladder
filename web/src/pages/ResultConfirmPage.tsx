import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { resolveResultToken, submitResultViaToken } from "../api/results.js";
import type { ResultOutcome } from "@tennisladder/shared";

export function ResultConfirmPage() {
  const { token } = useParams<{ token: string }>();
  const [outcome, setOutcome] = useState<ResultOutcome | null>(null);
  const [status, setStatus] = useState<"pending" | "resolved" | "submitted" | "error">("pending");

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
    await submitResultViaToken(token!);
    setStatus("submitted");
  }

  if (status === "pending") return <p>Loading…</p>;
  if (status === "error") return <p>This link is invalid or has already been used.</p>;
  if (status === "submitted") return <p>Recorded — thanks!</p>;

  return (
    <div>
      <h1>Confirm result</h1>
      <p>You reported: {outcome}</p>
      <button type="button" onClick={confirm}>
        Confirm
      </button>
    </div>
  );
}
