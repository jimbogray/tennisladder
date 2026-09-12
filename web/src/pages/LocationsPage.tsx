import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createLocation, deleteLocation, fetchLocations } from "../api/locations.js";
import { AddressAutocomplete } from "../components/AddressAutocomplete.js";
import { LocationMap } from "../components/LocationMap.js";
import { googleMapsApiKey } from "../lib/googleMaps.js";
import { useAuth } from "../hooks/useAuth.js";

export function LocationsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["locations"], queryFn: fetchLocations });
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [openMapId, setOpenMapId] = useState<string | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["locations"] });
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    await createLocation(name, address);
    setName("");
    setAddress("");
    setFormKey((key) => key + 1); // remounts the autocomplete so Google's own input clears too
    await refresh();
  }

  return (
    <div>
      <h1>Locations</h1>
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : (
        <ul className="location-list">
          {data.map((loc) => (
            <li key={loc.id} className="location-item">
              <div className="location-row">
                <div>
                  <strong>{loc.name}</strong>
                  {loc.address ? <p className="location-address">{loc.address}</p> : null}
                </div>
                <div className="location-actions">
                  {loc.address && googleMapsApiKey ? (
                    <button
                      type="button"
                      onClick={() => setOpenMapId(openMapId === loc.id ? null : loc.id)}
                    >
                      {openMapId === loc.id ? "Hide map" : "Show map"}
                    </button>
                  ) : null}
                  {isAdmin ? (
                    <>
                      {/* TODO: inline edit control */}
                      <button type="button" onClick={() => deleteLocation(loc.id).then(refresh)}>
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              {openMapId === loc.id && loc.address ? (
                <LocationMap address={loc.address} label={loc.name} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {isAdmin ? (
        <form onSubmit={handleAdd}>
          <h2>Add a location</h2>
          <input
            placeholder="New location name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <AddressAutocomplete key={formKey} value={address} onChange={setAddress} />
          <LocationMap address={address} label={name || "the new location"} />
          <button type="submit">Add</button>
        </form>
      ) : null}
    </div>
  );
}
