/**
 * Who a block of code emailed.
 *
 * The suite runs with no messaging provider configured (see `test/setup.ts`), so a send reaches no
 * inbox — it leaves one warning naming the address it would have gone to, and that line is the
 * only trace it leaves. Reading it keeps the production code free of a test-only seam, at the cost
 * of one string: if that warning is ever reworded, this helper is the single place to follow it.
 *
 * Addresses come back in send order, so a test can assert both who was told and how many emails a
 * transition sent.
 */
export async function recipientsOf(action: () => Promise<unknown>): Promise<string[]> {
  const recipients: string[] = [];
  const original = console.warn;

  console.warn = (...args: unknown[]) => {
    const match = /skipping send to (\S+)/.exec(String(args[0] ?? ""));
    if (match) {
      recipients.push(match[1]);
      return;
    }
    original(...args);
  };

  try {
    await action();
  } finally {
    console.warn = original;
  }

  return recipients;
}
