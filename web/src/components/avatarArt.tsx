import { AVATAR_IDS, type AvatarId } from "@tennisladder/shared";

/**
 * The ten predefined portraits (TL-20). Every one is the same cartoon tennis player drawn from one
 * parameterised figure — what differs is skin tone, hair texture and style, facial hair, glasses
 * and kit, so the set reads as ten different people rather than one person recoloured.
 *
 * `description` is what a screen reader gets in the picker, and it describes hair and kit only:
 * the drawings differ in ethnicity on purpose, but naming that in the UI would label the player
 * rather than the picture.
 */

/** Which hair silhouette to draw. `none` is a close shave, which pairs with a beard below. */
type HairStyle = "crop" | "afro" | "ponytail" | "bun" | "braids" | "long" | "cap" | "visor" | "headband" | "none";

interface AvatarArt {
  description: string;
  skin: string;
  /** A touch darker than `skin`, for the ear and chin shading that gives the face its shape. */
  skinShade: string;
  hair: string;
  hairStyle: HairStyle;
  beard: boolean;
  glasses: boolean;
  /** Shirt, and the collar/trim drawn on top of it. */
  kit: string;
  trim: string;
  /** Cap, visor or headband colour, where the style has one. */
  accessory: string;
  /** The tint behind the figure, so ten portraits side by side don't blur together. */
  backdrop: string;
}

export const AVATAR_ART: Record<AvatarId, AvatarArt> = {
  "avatar-1": {
    description: "Player with a blonde ponytail in a green shirt",
    skin: "#f7dcc0",
    skinShade: "#e8c4a1",
    hair: "#d9a441",
    hairStyle: "ponytail",
    beard: false,
    glasses: false,
    kit: "#1e7a3c",
    trim: "#ffffff",
    accessory: "#ffffff",
    backdrop: "#e7f2e9",
  },
  "avatar-2": {
    description: "Player with an afro in a yellow shirt",
    skin: "#8d5524",
    skinShade: "#78461c",
    hair: "#1b1b1b",
    hairStyle: "afro",
    beard: false,
    glasses: false,
    kit: "#d7e100",
    trim: "#0b3d24",
    accessory: "#0b3d24",
    backdrop: "#f5f7d6",
  },
  "avatar-3": {
    description: "Player with dark hair in a bun, in a blue shirt",
    skin: "#e6b98a",
    skinShade: "#d2a172",
    hair: "#2b1c12",
    hairStyle: "bun",
    beard: false,
    glasses: false,
    kit: "#3a7bd5",
    trim: "#ffffff",
    accessory: "#ffffff",
    backdrop: "#e3edfb",
  },
  "avatar-4": {
    description: "Player with braids in an orange shirt",
    skin: "#5c3a21",
    skinShade: "#4a2d19",
    hair: "#12100e",
    hairStyle: "braids",
    beard: false,
    glasses: false,
    kit: "#f26b3a",
    trim: "#ffffff",
    accessory: "#ffffff",
    backdrop: "#fce9e0",
  },
  "avatar-5": {
    description: "Player in a white cap and a green shirt",
    skin: "#f0c9a3",
    skinShade: "#dcb189",
    hair: "#7a4a22",
    hairStyle: "cap",
    beard: false,
    glasses: false,
    kit: "#2f9e52",
    trim: "#0b3d24",
    accessory: "#ffffff",
    backdrop: "#e7f2e9",
  },
  "avatar-6": {
    description: "Player with long dark hair and glasses, in a purple shirt",
    skin: "#c68642",
    skinShade: "#ad7136",
    hair: "#1e1512",
    hairStyle: "long",
    beard: false,
    glasses: true,
    kit: "#9b51e0",
    trim: "#ffffff",
    accessory: "#ffffff",
    backdrop: "#f1e8fc",
  },
  "avatar-7": {
    description: "Player with short red hair in a teal shirt",
    skin: "#fbe0c4",
    skinShade: "#eec9a5",
    hair: "#b0392b",
    hairStyle: "crop",
    beard: false,
    glasses: false,
    kit: "#06b6d4",
    trim: "#ffffff",
    accessory: "#ffffff",
    backdrop: "#e1f4f8",
  },
  "avatar-8": {
    description: "Player in a pink shirt and a white visor",
    skin: "#a9714b",
    skinShade: "#8f5d3c",
    hair: "#241a12",
    hairStyle: "visor",
    beard: false,
    glasses: false,
    kit: "#ef476f",
    trim: "#ffffff",
    accessory: "#ffffff",
    backdrop: "#fde8ee",
  },
  "avatar-9": {
    description: "Player with a beard and a close shave, in an amber shirt",
    skin: "#6b4226",
    skinShade: "#56341e",
    hair: "#171717",
    hairStyle: "none",
    beard: true,
    glasses: false,
    kit: "#ffb703",
    trim: "#0b3d24",
    accessory: "#0b3d24",
    backdrop: "#fff3db",
  },
  "avatar-10": {
    description: "Player with a beard and a green headband, in a white shirt",
    skin: "#d9a06b",
    skinShade: "#c08a58",
    hair: "#3a2a1c",
    hairStyle: "headband",
    beard: true,
    glasses: false,
    kit: "#ffffff",
    trim: "#1e7a3c",
    accessory: "#1e7a3c",
    backdrop: "#edf1ee",
  },
};

/** The picker renders them in this order; the shared list is the source of truth for the set. */
export const AVATAR_ORDER: readonly AvatarId[] = AVATAR_IDS;

/** Hair drawn behind the head: volume and length that the face should sit in front of. */
function HairBehind({ art }: { art: AvatarArt }) {
  switch (art.hairStyle) {
    case "afro":
      return <circle cx="32" cy="23" r="13.4" fill={art.hair} />;
    case "ponytail":
      return (
        <path
          d="M40 22c7 0.5 11 5.5 10.5 12.5 -0.4 5.5 -3 9.5 -6.5 11.5 1.5-6 1-12 -1.5-16 -1.5-2.5 -3-5 -2.5-8z"
          fill={art.hair}
        />
      );
    case "bun":
      return <circle cx="32" cy="12.5" r="5.2" fill={art.hair} />;
    case "braids":
      return (
        <g stroke={art.hair} strokeWidth="4.2" strokeLinecap="round" fill="none">
          <path d="M22.5 28c-2.5 5 -3 11 -2 15" />
          <path d="M41.5 28c2.5 5 3 11 2 15" />
        </g>
      );
    case "long":
      return <path d="M20 27c0-11 24-11 24 0l1.8 21h-27.6z" fill={art.hair} />;
    default:
      return null;
  }
}

/** The hairline, cap or band drawn over the head. */
function HairFront({ art }: { art: AvatarArt }) {
  const hairline = (
    <path
      d="M21.6 27c0-9 4-12.4 10.4-12.4S42.4 18 42.4 27c-1.4-5.5-5.4-7.5-10.4-7.5S23 21.5 21.6 27z"
      fill={art.hair}
    />
  );

  switch (art.hairStyle) {
    case "none":
      // A close shave: just enough shadow at the hairline to read as hair rather than a bald head.
      return (
        <path
          d="M21.7 25.4C21.7 16.8 25.8 13.8 32 13.8S42.3 16.8 42.3 25.4C40 18.6 36.2 16.4 32 16.4S24 18.6 21.7 25.4z"
          fill={art.hair}
          opacity="0.85"
        />
      );
    case "cap":
      return (
        <g>
          <path d="M21.3 25c0-8.3 4.8-11.6 10.7-11.6S42.7 16.7 42.7 25z" fill={art.accessory} />
          <path
            d="M21.6 25c-4.6 0-7.8 1.3-9 3.1 3.4 0.5 6.4 0.6 9 0.4z"
            fill={art.accessory}
            opacity="0.85"
          />
          <circle cx="32" cy="13.6" r="1.4" fill={art.kit} />
        </g>
      );
    case "visor":
      return (
        <g>
          {hairline}
          <path
            d="M21.4 24.4c-4.8 0-8.1 1.4-9.3 3.3 3.6 0.6 6.8 0.7 9.6 0.5z"
            fill={art.accessory}
            opacity="0.85"
          />
          <rect x="20.8" y="23.6" width="22.4" height="3.6" rx="1.8" fill={art.accessory} />
        </g>
      );
    case "headband":
      return (
        <g>
          {hairline}
          <rect x="20.9" y="22.4" width="22.2" height="3.6" rx="1.8" fill={art.accessory} />
        </g>
      );
    default:
      return hairline;
  }
}

/**
 * One portrait, as inline SVG so it inherits the page's colours and scales to whatever box it's
 * put in. Decorative by default — every place it's used shows or announces the player's name
 * alongside it.
 */
export function AvatarArtwork({ avatarId }: { avatarId: AvatarId }) {
  const art = AVATAR_ART[avatarId];

  return (
    <svg
      className="avatar-art"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="32" cy="32" r="32" fill={art.backdrop} />

      <g className="avatar-art__figure">
        <HairBehind art={art} />

        {/* Torso, drawn after the long-hair layer so the hair falls behind the shoulders. */}
        <path d="M15.5 60C15.5 46 22.5 40.2 32 40.2S48.5 46 48.5 60z" fill={art.kit} />
        <path
          d="M27.6 41.2 32 46.4 36.4 41.2"
          fill="none"
          stroke={art.trim}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {/* Arms: one loose at the side, one raised to the racket. */}
        <g stroke={art.skin} strokeWidth="5" strokeLinecap="round" fill="none">
          <path d="M22.5 45c-4 2.6-6.5 7-6.8 12" />
          <path d="M41.8 44.2c3.6-2.4 5.9-6.3 6.7-11.2" />
        </g>

        {/* Head. */}
        <circle cx="21.8" cy="28.4" r="2.3" fill={art.skinShade} />
        <circle cx="42.2" cy="28.4" r="2.3" fill={art.skinShade} />
        <rect x="29.2" y="34.6" width="5.6" height="6" rx="2.4" fill={art.skinShade} />
        <circle cx="32" cy="27" r="10.6" fill={art.skin} />

        {art.beard ? (
          <path
            d="M21.6 27.4c0.6 9.6 19.2 9.6 20.8 0 -2 5.4-18 5.4-20.8 0z"
            fill={art.hair}
            opacity="0.9"
          />
        ) : null}

        <circle cx="28.2" cy="26.8" r="1.2" fill="#2a2018" />
        <circle cx="35.8" cy="26.8" r="1.2" fill="#2a2018" />
        <path
          d="M28.7 31.3c1.9 2.2 4.7 2.2 6.6 0"
          fill="none"
          stroke="#2a2018"
          strokeWidth="1.3"
          strokeLinecap="round"
        />

        {art.glasses ? (
          <g fill="none" stroke="#2a2018" strokeWidth="1.1">
            <circle cx="28.2" cy="26.8" r="3.2" />
            <circle cx="35.8" cy="26.8" r="3.2" />
            <path d="M31.4 26.8h1.2M25 26.4l-3.1-0.6M39 26.4l3.1-0.6" strokeLinecap="round" />
          </g>
        ) : null}

        <HairFront art={art} />

        {/* Racket, rotated about the hand. */}
        <g className="avatar-art__racket">
          <path
            d="M48.5 33 52.2 25.8"
            stroke={art.trim === "#ffffff" ? "#3d2b1f" : art.trim}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <ellipse
            cx="53.6"
            cy="21.4"
            rx="4.6"
            ry="5.6"
            fill="rgba(255,255,255,0.4)"
            stroke={art.kit === "#ffffff" ? "#3d2b1f" : art.kit}
            strokeWidth="1.8"
          />
          <path
            d="M50 21.4h7.2M53.6 16.2v10.4"
            stroke="rgba(61,43,31,0.45)"
            strokeWidth="0.7"
          />
        </g>
      </g>

      {/* The ball, bouncing on its own so the portrait has one moving part even when still. */}
      <g className="avatar-art__ball">
        <circle cx="13.5" cy="21" r="3.4" fill="#e8f24a" stroke="#bcc400" strokeWidth="0.8" />
        <path
          d="M10.6 19.6a4.4 4.4 0 0 1 5.6 3.2"
          fill="none"
          stroke="#bcc400"
          strokeWidth="0.8"
        />
      </g>
    </svg>
  );
}
