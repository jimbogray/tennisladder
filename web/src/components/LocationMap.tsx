import { googleMapsApiKey } from "../lib/googleMaps.js";

/** Embedded Google map for an address. Renders nothing without an address or a Maps API key. */
export function LocationMap({ address, label }: { address: string; label: string }) {
  if (!googleMapsApiKey || !address) return null;

  const src = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
    googleMapsApiKey,
  )}&q=${encodeURIComponent(address)}`;

  return (
    <iframe
      className="location-map"
      title={`Map of ${label}`}
      src={src}
      loading="lazy"
      allowFullScreen
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
