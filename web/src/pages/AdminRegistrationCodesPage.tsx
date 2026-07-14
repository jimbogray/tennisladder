import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRegistrationCode,
  expireRegistrationCode,
  fetchRegistrationCodes,
  type RegistrationCodeDto,
} from "../api/admin.js";

function statusOf(c: RegistrationCodeDto): "active" | "used" | "expired" {
  if (c.usedAt) return "used";
  if (c.isActive) return "active";
  return "expired";
}

export function AdminRegistrationCodesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "registration-codes"],
    queryFn: fetchRegistrationCodes,
  });

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

  return (
    <div>
      <h1>Registration Codes</h1>
      <button type="button" onClick={handleGenerate}>
        Generate new code
      </button>
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : data.length === 0 ? (
        <p>No registration codes yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Code</th>
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
