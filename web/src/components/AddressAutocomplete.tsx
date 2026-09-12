import { useEffect, useRef, useState } from "react";
import { googleMapsApiKey, loadGoogleMaps } from "../lib/googleMaps.js";

/**
 * Google Places autocomplete for a postal address. Falls back to a plain text input when no
 * Maps API key is configured or the API fails to load, so an address can always be entered.
 *
 * Google owns the widget's input, so there is no way to push `value` back into it. Remount the
 * component (change its `key`) to clear it.
 */
export function AddressAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (address: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(!googleMapsApiKey);

  // Read through a ref so a changing onChange prop doesn't tear down and rebuild the widget.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!googleMapsApiKey) return;

    let cancelled = false;
    let widget: HTMLElement | null = null;

    loadGoogleMaps()
      .then(async () => {
        const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
        if (cancelled || !containerRef.current) return;

        widget = new PlaceAutocompleteElement();
        widget.addEventListener("gmp-select", async (event) => {
          const place = event.placePrediction.toPlace();
          await place.fetchFields({ fields: ["formattedAddress"] });
          onChangeRef.current(place.formattedAddress ?? "");
        });
        containerRef.current.appendChild(widget);
      })
      .catch((err) => {
        console.warn("Places autocomplete unavailable, falling back to a plain input:", err);
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
      widget?.remove();
    };
  }, []);

  if (unavailable) {
    return (
      <input
        placeholder="Address"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return <div className="address-autocomplete" ref={containerRef} />;
}
