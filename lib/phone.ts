/**
 * Phone normalisation to E.164.
 *
 * The reason this exists: `intakeSchema` requires strict E.164 (`+60123456789`), but
 * almost nothing supplies it. Meta lead forms return whatever the user typed — often
 * `012-345 6789`, sometimes `60123456789`, occasionally `+60 12 345 6789`. Rejecting
 * those means silently binning leads the agency paid for, which is the worst possible
 * failure for a paid-acquisition channel.
 *
 * Deliberately conservative: anything that cannot be normalised with confidence is
 * returned as null so the caller fails loudly, rather than guessed at and stored wrong.
 * A wrong phone number in a CRM is worse than a missing one — an agent burns a call on
 * it and the real lead is never chased.
 */

/** Malaysia. The agency operates here; a bare local number means a Malaysian one. */
const DEFAULT_COUNTRY_CODE = "60";

/** E.164: a plus, a non-zero leading digit, then 7 to 15 digits in total. */
const E164 = /^\+[1-9]\d{6,14}$/;

export function isE164(value: string): boolean {
  return E164.test(value);
}

/**
 * Normalise a phone number to E.164, or null when it cannot be done safely.
 *
 * @param raw          whatever arrived
 * @param countryCode  digits only, no plus. Defaults to Malaysia.
 */
export function toE164(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null;

  // Strip everything a human or a form might add: spaces, dashes, dots, brackets.
  // A leading "+" is meaningful, so it is preserved before the strip.
  const trimmed = String(raw).trim();
  const hadPlus = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  let national = digits;

  if (trimmed.startsWith("00")) {
    // International prefix dialled the old way: 0060... is +60...
    national = digits.slice(2);
  } else if (hadPlus) {
    national = digits;
  } else if (digits.startsWith(countryCode) && digits.length > countryCode.length + 6) {
    // Already carries the country code without a plus: 60123456789.
    national = digits;
  } else if (digits.startsWith("0")) {
    // National format: 012-345 6789 -> 60123456789. The trunk zero is dropped.
    national = countryCode + digits.slice(1);
  } else {
    // A bare local number with no trunk zero and no country code. Assuming a country
    // here is a guess, and a wrong number is worse than a rejected one — but a number
    // of plausible national length is the common case for a form that strips the zero.
    if (digits.length < 7 || digits.length > 11) return null;
    national = countryCode + digits;
  }

  const candidate = `+${national}`;
  return E164.test(candidate) ? candidate : null;
}
