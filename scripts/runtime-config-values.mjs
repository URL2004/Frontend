const MASKED_RUNTIME_VALUE_RE = /^\[(?:sensitive|redacted)\]$/iu;

export function publicRuntimeValue(value, fallback = '') {
  const normalized = String(value == null ? '' : value)
    .replace(/^\uFEFF/u, '')
    .trim();
  if (!normalized || MASKED_RUNTIME_VALUE_RE.test(normalized)) return fallback;
  return normalized;
}

