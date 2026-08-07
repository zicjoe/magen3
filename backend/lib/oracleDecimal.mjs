const MAX_DECIMALS = 36;

function clean(value) { return String(value ?? '').trim(); }

export function normalizeDecimal(value) {
  const raw = clean(value);
  if (!/^[+]?(?:\d+)(?:\.\d+)?$/.test(raw)) throw new Error('Decimal value must be a positive base-10 number');
  const unsigned = raw.replace(/^\+/, '');
  let [whole, fraction = ''] = unsigned.split('.');
  whole = whole.replace(/^0+(?=\d)/, '') || '0';
  fraction = fraction.replace(/0+$/, '');
  if (fraction.length > MAX_DECIMALS) throw new Error(`Decimal precision exceeds ${MAX_DECIMALS} places`);
  if (/^0+$/.test(whole) && !fraction) throw new Error('Decimal value must be greater than zero');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function decimalToScaled(value, scale = 18) {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_DECIMALS) throw new Error('Invalid decimal scale');
  const normalized = normalizeDecimal(value);
  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > scale) {
    const discarded = fraction.slice(scale);
    if (/[^0]/.test(discarded)) throw new Error(`Decimal value exceeds configured scale ${scale}`);
  }
  const digits = `${whole}${fraction.slice(0, scale).padEnd(scale, '0')}`.replace(/^0+(?=\d)/, '') || '0';
  const amount = BigInt(digits);
  if (amount <= 0n) throw new Error('Decimal value must be greater than zero');
  return amount;
}

export function scaledToDecimal(value, scale = 18) {
  const amount = typeof value === 'bigint' ? value : BigInt(value);
  if (amount < 0n) throw new Error('Scaled value must not be negative');
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_DECIMALS) throw new Error('Invalid decimal scale');
  const digits = amount.toString().padStart(scale + 1, '0');
  if (scale === 0) return digits;
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function pythPriceToDecimal(price, expo) {
  const integer = clean(price);
  const exponent = Number(expo);
  if (!/^-?\d+$/.test(integer) || !Number.isInteger(exponent) || exponent < -36 || exponent > 36) throw new Error('Invalid Pyth price/exponent');
  const amount = BigInt(integer);
  if (amount <= 0n) throw new Error('Oracle price must be greater than zero');
  if (exponent >= 0) return normalizeDecimal((amount * (10n ** BigInt(exponent))).toString());
  const scale = -exponent;
  return scaledToDecimal(amount, scale);
}

export function divideDecimal(numerator, denominator, scale = 18) {
  const left = decimalToScaled(numerator, scale);
  const right = decimalToScaled(denominator, scale);
  if (right <= 0n) throw new Error("Denominator must be greater than zero");
  const quotient = (left * (10n ** BigInt(scale)) + right / 2n) / right;
  return scaledToDecimal(quotient, scale);
}

export function deviationBps(a, b, scale = 18) {
  const left = decimalToScaled(a, scale);
  const right = decimalToScaled(b, scale);
  const diff = left >= right ? left - right : right - left;
  return Number((diff * 10_000n + right / 2n) / right);
}

export function spreadBps(minimum, maximum, reference, scale = 18) {
  const min = decimalToScaled(minimum, scale);
  const max = decimalToScaled(maximum, scale);
  const ref = decimalToScaled(reference, scale);
  return Number(((max - min) * 10_000n + ref / 2n) / ref);
}

export function medianDecimal(values, scale = 18) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const scaled = values.map((value) => decimalToScaled(value, scale)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const mid = Math.floor(scaled.length / 2);
  const result = scaled.length % 2 ? scaled[mid] : (scaled[mid - 1] + scaled[mid]) / 2n;
  return scaledToDecimal(result, scale);
}

export function averageInteger(values = []) {
  if (!values.length) return 0;
  const sum = values.reduce((total, value) => total + BigInt(Math.trunc(Number(value) || 0)), 0n);
  return Number((sum + BigInt(Math.floor(values.length / 2))) / BigInt(values.length));
}
