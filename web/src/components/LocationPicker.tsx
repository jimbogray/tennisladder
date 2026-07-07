import type { LocationDto } from "@tennisladder/shared";

export function LocationPicker({
  locations,
  value,
  onChange,
}: {
  locations: LocationDto[];
  value: string;
  onChange: (locationId: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        Select a location
      </option>
      {locations.map((loc) => (
        <option key={loc.id} value={loc.id}>
          {loc.name}
        </option>
      ))}
    </select>
  );
}
