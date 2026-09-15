// Minimal typings for the slice of the Google Maps JavaScript API this app actually uses
// (Place Autocomplete). The full @types/google.maps package isn't a dependency.

interface GooglePlace {
  formattedAddress?: string | null;
  fetchFields(request: { fields: string[] }): Promise<unknown>;
}

interface GooglePlacePrediction {
  toPlace(): GooglePlace;
}

interface GooglePlaceSelectEvent extends Event {
  placePrediction: GooglePlacePrediction;
}

interface HTMLElementEventMap {
  "gmp-select": GooglePlaceSelectEvent;
  // Fired when a request to Google is refused (e.g. the key doesn't allow this site's referrer).
  "gmp-error": Event;
}

declare namespace google.maps {
  function importLibrary(library: "places"): Promise<{
    PlaceAutocompleteElement: new () => HTMLElement;
  }>;
}
