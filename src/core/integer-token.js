// File coordinates must consume the entire decimal token without rounding.
export function parseUnsignedIntegerToken(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return NaN;
  const number = Number(text);
  return Number.isSafeInteger(number) ? number : NaN;
}
