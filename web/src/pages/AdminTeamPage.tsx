import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountType } from "@tennisladder/shared";
import { fetchTeamMembers, updateTeamMemberAccountType, type TeamMemberDto } from "../api/admin.js";
import { ApiError } from "../api/client.js";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from "../lib/accountTypes.js";
import { useAuth } from "../hooks/useAuth.js";

export function AdminTeamPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "team"], queryFn: fetchTeamMembers });
  // Picking a type in a row's dropdown only stages it; nothing is saved until that row's ✓ button.
  const [staged, setStaged] = useState<Record<string, AccountType>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
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
            {data.map((member) => {
              const isMe = member.id === user?.id;
              const selected = staged[member.id] ?? member.accountType;
              const saving = savingId === member.id;
              return (
                <tr key={member.id} className={isMe ? "row-me" : undefined}>
                  <td>
                    {member.firstName} {member.lastName}
                    {isMe ? <span className="you-badge">you</span> : null}
                    {/* Takes the place of the Email column on narrow screens; see global.css. */}
                    <span className="team-email-inline">{member.email}</span>
                  </td>
                  <td className="team-email">{member.email}</td>
                  <td>
                    <div className="team-type">
                      <select
                        aria-label={`Account type for ${member.firstName} ${member.lastName}`}
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
                        aria-label={`Commit account type for ${member.firstName} ${member.lastName}`}
                        title="Commit change"
                        disabled={!staged[member.id] || saving}
                        onClick={() => commit(member)}
                      >
                        <span aria-hidden="true">{saving ? "…" : "✓"}</span>
                      </button>
                    </div>
                    {error?.memberId === member.id ? <p role="alert">{error.message}</p> : null}
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
