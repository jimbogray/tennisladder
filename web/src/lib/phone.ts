/**
 * Renders a stored E.164 number the way a reader expects to see it. North American numbers get
 * the familiar grouping; anything else is left alone rather than guessed at, since grouping rules
 * vary by country and a wrong guess reads worse than the raw digits.
 */
export function formatPhoneNumber(e164: string): string {
  const nanp = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return nanp ? `+1 (${nanp[1]}) ${nanp[2]}-${nanp[3]}` : e164;
}
