import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountType } from "@tennisladder/shared";
import {
  erasePersonalData,
  fetchTeamMembers,
  removeTeamMember,
  updateTeamMemberAccountType,
  type ErasureSummaryDto,
  type TeamMemberDto,
} from "../api/admin.js";
import { ApiError } from "../api/client.js";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from "../lib/accountTypes.js";
import { useAuth } from "../hooks/useAuth.js";

/**
 * People already off the team, listed only so their data can be erased on request.
 *
 * Erasure is deliberately not offered beside Remove on a current member: removing someone is
 * routine and undoable, this isn't, and the two shouldn't be adjacent buttons. Once erased a row
 * stops being listed at all, so this list is the queue of removals nobody has asked to clear.
 */
function RemovedMembers({
  members,
  onErased,
}: {
  members: TeamMemberDto[];
  onErased: () => Promise<unknown>;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [erasingId, setErasingId] = useState<string | null>(null);
  const [error, setError] = useState<{ memberId: string; message: string } | null>(null);
  const [done, setDone] = useState<{ name: string; summary: ErasureSummaryDto } | null>(null);

  async function erase(member: TeamMemberDto) {
    setError(null);
    setErasingId(member.id);
    try {
      const summary = await erasePersonalData(member.id);
      setConfirmingId(null);
      setDone({ name: `${member.firstName} ${member.lastName}`, summary });
      await onErased();
    } catch (err) {
      setConfirmingId(null);
      setError({
        memberId: member.id,
        message:
          err instanceof ApiError ? err.message : "Could not erase this person's data. Please try again.",
      });
    } finally {
      setErasingId(null);
    }
  }

  if (members.length === 0 && !done) return null;

  return (
    <section className="team-removed">
      <h2>Removed from the team</h2>
      <p>
        These people can no longer sign in. Their details are still on file so their past matches
        read properly. If someone asks for their details to be removed, erase them here.
      </p>
      {done ? (
        <p role="status">
          {done.name}'s details have been erased: {done.summary.savedPlacesDeleted} saved{" "}
          {done.summary.savedPlacesDeleted === 1 ? "place" : "places"} deleted,{" "}
          {done.summary.messagesCleared}{" "}
          {done.summary.messagesCleared === 1 ? "message" : "messages"} cleared, and{" "}
          {done.summary.matchesKept} {done.summary.matchesKept === 1 ? "match" : "matches"} kept
          against a placeholder name.
        </p>
      ) : null}
      <ul className="team-removed-list">
        {members.map((member) => {
          const name = `${member.firstName} ${member.lastName}`;
          const erasing = erasingId === member.id;
          return (
            <li key={member.id}>
              <div className="team-removed-row">
                <div>
                  <strong>{name}</strong>
                  <span className="team-email-inline">{member.email}</span>
                </div>
                {confirmingId === member.id ? null : (
                  <button
                    type="button"
                    className="button-danger"
                    aria-label={`Erase ${name}'s personal data`}
                    disabled={erasing}
                    onClick={() => {
                      setError(null);
                      setConfirmingId(member.id);
                    }}
                  >
                    Erase data
                  </button>
                )}
              </div>
              {confirmingId === member.id ? (
                <div className="team-remove-confirm">
                  <p>
                    Erase everything the ladder holds about {member.firstName}? Their name, email,
                    rating, phone number, saved places and anything they typed are deleted for good.
                    Matches they played are kept under a placeholder name so the other player's
                    history stays intact. This can't be undone.
                  </p>
                  <div className="team-remove-actions">
                    <button
                      type="button"
                      className="button-danger"
                      disabled={erasing}
                      onClick={() => erase(member)}
                    >
                      {erasing ? "Erasing…" : "Erase for good"}
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={erasing}
                      onClick={() => setConfirmingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {error?.memberId === member.id ? <p role="alert">{error.message}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AdminTeamPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "team"], queryFn: fetchTeamMembers });
  // Picking a type in a row's dropdown only stages it; nothing is saved until that row's ✓ button.
  const [staged, setStaged] = useState<Record<string, AccountType>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  // The row whose Remove button was pressed and is waiting for the admin to confirm.
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [error, setError] = useState<{ memberId: string; message: string } | null>(null);

  function stage(member: TeamMemberDto, accountType: AccountType) {
    setError(null);
    setStaged(({ [member.id]: _, ...rest }) =>
      accountType === member.accountType ? rest : { ...rest, [member.id]: accountType },
    );
  }

  async function commit(member: TeamMemberDto) {
    const accountType = staged[member.id];
    if (!accountType) return;
    setError(null);
    setSavingId(member.id);
    try {
      await updateTeamMemberAccountType(member.id, accountType);
      await queryClient.invalidateQueries({ queryKey: ["admin", "team"] });
      setStaged(({ [member.id]: _, ...rest }) => rest);
    } catch (err) {
      setError({
        memberId: member.id,
        message: err instanceof ApiError ? err.message : "Could not change the account type. Please try again.",
      });
    } finally {
      setSavingId(null);
    }
  }

  function startRemove(member: TeamMemberDto) {
    setError(null);
    setConfirmingRemoveId(member.id);
  }

  async function remove(member: TeamMemberDto) {
    setError(null);
    setSavingId(member.id);
    try {
      await removeTeamMember(member.id);
      setConfirmingRemoveId(null);
      setStaged(({ [member.id]: _, ...rest }) => rest);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "team"] }),
        queryClient.invalidateQueries({ queryKey: ["ladder"] }),
        queryClient.invalidateQueries({ queryKey: ["players", "challengeable"] }),
      ]);
    } catch (err) {
      setConfirmingRemoveId(null);
      setError({
        memberId: member.id,
        message: err instanceof ApiError ? err.message : "Could not remove this person. Please try again.",
      });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <h1>Team</h1>

      {isLoading || !data ? (
        <p>Loading…</p>
      ) : (
        <table className="team-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="team-email">Email</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {data
              .filter((member) => member.removedAt === null)
              .map((member) => {
              const isMe = member.id === user?.id;
              const name = `${member.firstName} ${member.lastName}`;
              const selected = staged[member.id] ?? member.accountType;
              const saving = savingId === member.id;
              return (
                <tr key={member.id} className={isMe ? "row-me" : undefined}>
                  <td>
                    {name}
                    {isMe ? <span className="you-badge">you</span> : null}
                    {/* Takes the place of the Email column on narrow screens; see global.css. */}
                    <span className="team-email-inline">{member.email}</span>
                    {/* Phones have no room for Remove beside the dropdown, so it sits here instead. */}
                    {isMe || confirmingRemoveId === member.id ? null : (
                      <button
                        type="button"
                        className="button-danger team-remove-inline"
                        aria-label={`Remove ${name} from the team`}
                        disabled={saving}
                        onClick={() => startRemove(member)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                  <td className="team-email">{member.email}</td>
                  <td>
                    {confirmingRemoveId === member.id ? (
                      <div className="team-remove-confirm">
                        <p>
                          Remove {member.firstName} from the team? They'll be signed out and taken off the
                          ladder. Their past matches are kept.
                        </p>
                        <div className="team-remove-actions">
                          <button
                            type="button"
                            className="button-danger"
                            disabled={saving}
                            onClick={() => remove(member)}
                          >
                            {saving ? "Removing…" : "Remove"}
                          </button>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={saving}
                            onClick={() => setConfirmingRemoveId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="team-type">
                        <select
                          aria-label={`Account type for ${name}`}
                          value={selected}
                          disabled={saving}
                          onChange={(e) => stage(member, e.target.value as AccountType)}
                        >
                          {ACCOUNT_TYPES.map((type) => (
                            // You can't take away your own admin access.
                            <option key={type} value={type} disabled={isMe && type === "PLAYER"}>
                              {ACCOUNT_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="team-commit"
                          aria-label={`Commit account type for ${name}`}
                          title="Commit change"
                          disabled={!staged[member.id] || saving}
                          onClick={() => commit(member)}
                        >
                          <span aria-hidden="true">{saving ? "…" : "✓"}</span>
                        </button>
                        {/* Kept (disabled) on your own row so the dropdowns stay aligned down the table. */}
                        <button
                          type="button"
                          className="button-danger team-remove"
                          aria-label={`Remove ${name} from the team`}
                          title={isMe ? "You can't remove yourself" : "Remove from team"}
                          disabled={isMe || saving}
                          onClick={() => startRemove(member)}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                    {error?.memberId === member.id ? <p role="alert">{error.message}</p> : null}
                  </td>
                </tr>
                );
              })}
          </tbody>
        </table>
      )}

      {data ? (
        <RemovedMembers
          members={data.filter((member) => member.removedAt !== null)}
          onErased={() => queryClient.invalidateQueries({ queryKey: ["admin", "team"] })}
        />
      ) : null}
    </div>
  );
}
