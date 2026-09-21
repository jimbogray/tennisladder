/**
 * The handful of real-world details the privacy policy and terms need, kept in one place so
 * they're changed once rather than hunted through prose.
 *
 * TODO(club): replace OPERATOR and GOVERNING_LAW with the club's actual registered name and
 * state before submitting these URLs to a carrier — a reviewer checks that the entity named here
 * matches the one on the toll-free verification application, and a mismatch is a rejection.
 */
export const LEGAL = {
  /** The name these documents are made in — the club or entity that runs the ladder. */
  OPERATOR: "Playmore Tennis",
  /** Where questions about either document go. */
  CONTACT_EMAIL: "ladder@playmore.tennis",
  /** US state whose law governs the terms. */
  GOVERNING_LAW: "the State of New York",
  /** Shown on both pages, and what a reviewer checks against the version they were sent. */
  LAST_UPDATED: "21 September 2026",
} as const;

/**
 * The SMS program, described once and shown in three places that have to agree with each other:
 * the terms, the privacy policy, and the consent text beside the phone field on the profile page.
 * Carriers compare all three against the verification application, so they are deliberately one
 * source rather than three similar paragraphs.
 */
export const SMS_PROGRAM = {
  /** What the messages are. Matches the "program description" on the application. */
  DESCRIPTION:
    "confirmation codes, and notifications about your own matches — challenges, scheduling " +
    "and results",
  /** Carriers require a frequency statement, and "varies" is only acceptable if it's honest. */
  FREQUENCY: "Message frequency varies and depends on your own match activity.",
  RATES: "Message and data rates may apply.",
  OPT_OUT: "Reply STOP to any message to opt out, or remove your number on your profile page.",
  HELP: "Reply HELP for help.",
} as const;
