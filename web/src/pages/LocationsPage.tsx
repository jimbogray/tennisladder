import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createLocation, deleteLocation, fetchLocations } from "../api/locations.js";
import { useAuth } from "../hooks/useAuth.js";

export function LocationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["locations"], queryFn: fetchLocations });
  const [name, setName] = useState("");

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["locations"] });
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    await createLocation(name);
    setName("");
    await refresh();
  }

  return (
    <div>
      <h1>Locations</h1>
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : (
        <ul>
          {data.map((loc) => (
            <li key={loc.id}>
              {loc.name}
              {isAdmin ? (
                <>
                  {/* TODO: inline edit control */}
                  <button type="button" onClick={() => deleteLocation(loc.id).then(refresh)}>
                    Delete
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {isAdmin ? (
        <form onSubmit={handleAdd}>
          <input placeholder="New location name" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">Add</button>
        </form>
      ) : null}
    </div>
  );
}
