import { useState, type KeyboardEvent } from "react";
import type { CreateUserAddressRequest } from "@tennisladder/shared";
import { AddressAutocomplete } from "./AddressAutocomplete.js";

const PRESET_LABELS = ["Home", "Office"] as const;
const CUSTOM = "custom";

/**
 * Adds one labelled address to a list. Deliberately not a <form>: registration renders it inside
 * its own form, and forms can't nest — so Enter is handled here instead of submitting the page.
 */
export function SavedAddressForm({
  existingLabels,
  onAdd,
  idPrefix,
}: {
  existingLabels: string[];
  /** Resolve once the address is saved; reject (with a message) to keep the form filled in. */
  onAdd: (input: CreateUserAddressRequest) => Promise<void> | void;
  /** Keeps label/input ids unique when a page could render more than one of these. */
  idPrefix: string;
}) {
  const taken = new Set(existingLabels.map((label) => label.toLowerCase()));
  const firstFreePreset = PRESET_LABELS.find((label) => !taken.has(label.toLowerCase()));

  const [labelChoice, setLabelChoice] = useState<string>(firstFreePreset ?? CUSTOM);
  const [customLabel, setCustomLabel] = useState("");
  const [address, setAddress] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A preset that's since been used (e.g. "Home" was just added) falls through to the next one.
  const effectiveChoice =
    labelChoice !== CUSTOM && taken.has(labelChoice.toLowerCase())
      ? (firstFreePreset ?? CUSTOM)
      : labelChoice;
  const label = effectiveChoice === CUSTOM ? customLabel.trim() : effectiveChoice;

  async function handleAdd() {
    setError(null);
    if (!label) {
      setError("Give the address a label, such as Home.");
      return;
    }
    if (taken.has(label.toLowerCase())) {
      setError(`You already have an address labelled "${label}".`);
      return;
    }
    if (!address.trim()) {
      setError("Choose an address.");
      return;
    }

    setBusy(true);
    try {
      await onAdd({ label, address: address.trim() });
      setCustomLabel("");
      setAddress("");
      const justAdded = label.toLowerCase();
      setLabelChoice(
        PRESET_LABELS.find((p) => !taken.has(p.toLowerCase()) && p.toLowerCase() !== justAdded) ??
          CUSTOM,
      );
      setFormKey((key) => key + 1); // remounts the autocomplete so Google's own input clears too
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that address. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter" || e.target instanceof HTMLTextAreaElement) return;
    // Never let Enter submit an enclosing form. Only our own text inputs add the address: Enter in
    // Google's widget picks a suggestion, which then fills `address` asynchronously.
    e.preventDefault();
    if (e.target instanceof HTMLInputElement) void handleAdd();
  }

  return (
    <div className="saved-address-form" onKeyDown={handleKeyDown}>
      {error ? <p role="alert">{error}</p> : null}
      <label htmlFor={`${idPrefix}-label`}>Label</label>
      <select
        id={`${idPrefix}-label`}
        value={effectiveChoice}
        onChange={(e) => setLabelChoice(e.target.value)}
      >
        {PRESET_LABELS.filter((preset) => !taken.has(preset.toLowerCase())).map((preset) => (
          <option key={preset} value={preset}>
            {preset}
          </option>
        ))}
        <option value={CUSTOM}>Something else…</option>
      </select>
      {effectiveChoice === CUSTOM ? (
        <input
          aria-label="Custom label"
          placeholder="e.g. Parents' house"
          maxLength={40}
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
        />
      ) : null}
      <span className="saved-address-form-heading">Address</span>
      <AddressAutocomplete key={formKey} value={address} onChange={setAddress} />
      <button type="button" className="button-secondary" onClick={handleAdd} disabled={busy}>
        {busy ? "Adding…" : "Add address"}
      </button>
    </div>
  );
}
