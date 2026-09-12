export const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";

// Google invokes this global once the API core is ready. A plain script `onload` is too early —
// it fires before google.maps.importLibrary is defined.
const readyCallbackName = "__tennisLadderGoogleMapsReady";

let loader: Promise<void> | null = null;

/** Loads the Maps JavaScript API bootstrap once per page, then resolves for every later caller. */
export function loadGoogleMaps(): Promise<void> {
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    (window as unknown as Record<string, () => void>)[readyCallbackName] = () => resolve();

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      googleMapsApiKey,
    )}&v=weekly&loading=async&callback=${readyCallbackName}`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load the Google Maps JavaScript API"));
    document.head.appendChild(script);
  });

  return loader;
}
