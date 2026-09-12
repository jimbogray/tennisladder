import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRegistrationCode,
  expireRegistrationCode,
  fetchRegistrationCodes,
  inviteByEmail,
  type RegistrationCodeDto,
} from "../api/admin.js";
import { ApiError } from "../api/client.js";

function statusOf(c: RegistrationCodeDto): "active" | "used" | "expired" {
  if (c.usedAt) return "used";
  if (c.isActive) return "active";
  return "expired";
}

export function AdminInvitesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "registration-codes"],
    queryFn: fetchRegistrationCodes,
  });
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin", "registration-codes"] });
  }

  async function handleGenerate() {
    await createRegistrationCode();
    await refresh();
  }

  async function handleExpire(id: string) {
    await expireRegistrationCode(id);
    await refresh();
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSentTo(null);
    setSending(true);
    try {
      await inviteByEmail(email);
      setSentTo(email);
      setEmail("");
      setShowInviteForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the invite. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1>Invites</h1>

      <div className="invite-actions">
        <button type="button" onClick={handleGenerate}>
          Generate new code
        </button>
        <button type="button" onClick={() => setShowInviteForm((open) => !open)}>
          {showInviteForm ? "Cancel" : "Invite"}
        </button>
      </div>

      {showInviteForm ? (
        <form className="invite-form" onSubmit={handleInvite}>
          <input
            type="email"
            required
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" disabled={sending}>
            {sending ? "Sending…" : "Send invite"}
          </button>
        </form>
      ) : null}

      {error ? <p role="alert">{error}</p> : null}
      {sentTo ? <p className="invite-sent">Invite sent to {sentTo}.</p> : null}

      {isLoading || !data ? (
        <p>Loading…</p>
      ) : data.length === 0 ? (
        <p>No invites yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Invited</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Used</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => {
              const status = statusOf(c);
              return (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.invitedEmail ?? "—"}</td>
                  <td>{status}</td>
                  <td>{new Date(c.expiresAt).toLocaleString()}</td>
                  <td>{c.usedAt ? new Date(c.usedAt).toLocaleString() : "—"}</td>
                  <td>
                    {status === "active" && (
                      <button type="button" onClick={() => handleExpire(c.id)}>
                        Expire
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
