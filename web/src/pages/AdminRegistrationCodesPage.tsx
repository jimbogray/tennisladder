import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createRegistrationCode, fetchRegistrationCodes } from "../api/admin.js";

export function AdminRegistrationCodesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "registration-codes"],
    queryFn: fetchRegistrationCodes,
  });

  async function handleGenerate() {
    await createRegistrationCode();
    await queryClient.invalidateQueries({ queryKey: ["admin", "registration-codes"] });
  }

  return (
    <div>
      <h1>Registration Codes</h1>
      <button type="button" onClick={handleGenerate}>
        Generate new code
      </button>
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : (
        <ul>
          {data.map((c) => (
            <li key={c.id}>
              {c.code} — {c.isActive ? "active" : c.usedAt ? "used" : "expired"} (expires{" "}
              {new Date(c.expiresAt).toLocaleString()})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
