// Fixed decimals preserve domain presentation while keeping a nonzero value visible.
export function formatFixedNumber(value, decimals, significantDigits = 6) {
  const fixed = value.toFixed(decimals);
  return value !== 0 && Number(fixed) === 0 ? Number(value.toPrecision(significantDigits)).toString() : fixed;
}
