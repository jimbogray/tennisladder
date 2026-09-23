import { escapeHtml } from "../escapeHtml.js";

export interface ResultFinalizedTemplateInput {
  recipientFirstName: string;
  opponentFirstName: string;
  /** From the recipient's point of view. A tie is neither a win nor a loss and moves nobody. */
  outcome: "WON" | "LOST" | "TIED";
  /** Points the win was worth, or null when nothing moved. */
  pointsAwarded: number | null;
  /** Where the recipient stands now, after the match was applied. */
  recipientPoints: number;
  ladderUrl: string;
}

export function renderResultFinalizedEmail(input: ResultFinalizedTemplateInput): { subject: string; html: string } {
  const opponent = escapeHtml(input.opponentFirstName);

  const headline = {
    WON: `You beat ${opponent}, and it's on the ladder.`,
    LOST: `${opponent} beat you, and it's on the ladder.`,
    TIED: `Your match with ${opponent} finished level, and it's on the ladder.`,
  }[input.outcome];

  // Points only ever move to a winner: a loss and a draw both leave every total alone.
  const pointsLine =
    input.outcome === "WON" && input.pointsAwarded
      ? `That was worth ${input.pointsAwarded} ${input.pointsAwarded === 1 ? "point" : "points"}. You're on ${input.recipientPoints} now.`
      : `Your total is unchanged at ${input.recipientPoints}.`;

  return {
    subject: {
      WON: `You won against ${input.opponentFirstName}`,
      LOST: `Result confirmed: ${input.opponentFirstName} won`,
      TIED: `Result confirmed: you drew with ${input.opponentFirstName}`,
    }[input.outcome],
    html: `
      <p>Hi ${escapeHtml(input.recipientFirstName)},</p>
      <p>${headline}</p>
      <p>${pointsLine}</p>
      <p><a href="${escapeHtml(input.ladderUrl)}">See the ladder</a></p>
    `.trim(),
  };
}
