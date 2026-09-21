import { AVATAR_IDS, type AvatarId } from "@tennisladder/shared";
import { Avatar } from "./Avatar.js";
import { AVATAR_ART } from "./avatarArt.js";

/**
 * The ten predefined portraits, plus the initials badge as the eleventh, "no avatar" option.
 * Native radios: they give keyboard support and a single selection for free, and the artwork is
 * just the label. `value` is "" for the initials option, which is what the API takes for "clear it".
 */
export function AvatarPicker({
  value,
  firstName,
  lastName,
  onChange,
  hint = "Shown next to your name in the ladder and on your account menu.",
}: {
  value: AvatarId | "";
  firstName: string;
  lastName: string;
  onChange: (value: AvatarId | "") => void;
  hint?: string;
}) {
  return (
    <fieldset className="avatar-picker">
      <legend>Your avatar</legend>
      <p className="profile-section-hint">{hint}</p>
      <div className="avatar-picker-options">
        <label className={`avatar-option${value === "" ? " avatar-option--selected" : ""}`}>
          <input
            type="radio"
            name="avatarId"
            value=""
            checked={value === ""}
            onChange={() => onChange("")}
          />
          <Avatar firstName={firstName} lastName={lastName} size="lg" />
          <span className="visually-hidden">Your initials, no avatar</span>
        </label>
        {AVATAR_IDS.map((id) => (
          <label
            key={id}
            className={`avatar-option${value === id ? " avatar-option--selected" : ""}`}
          >
            <input
              type="radio"
              name="avatarId"
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
            />
            <Avatar firstName={firstName} lastName={lastName} avatarId={id} size="lg" />
            <span className="visually-hidden">{AVATAR_ART[id].description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
