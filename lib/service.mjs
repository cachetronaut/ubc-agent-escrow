import { createHash } from 'node:crypto';

// Authored fixture, not a mutable web page. Amounts are integer US cents.
export const SNAPSHOT = Object.freeze({
  id: 'catalog-2026-11-15-v1',
  source: 'urn:ubc-agent-escrow:catalog:2026-11-15:v1',
  text: 'Field Supplies catalog, captured November 15, 2026.\nSKU A11: Cedar notebook, USD 12.50, in stock.\nSKU B20: Steel bottle, USD 24.00, sold out.\nSKU C31: Canvas pouch, USD 8.75, in stock.\nPrices exclude delivery. No delivery fee is stated.',
});
export const CRITERIA = Object.freeze({
  service: 'fixed-catalog-extraction-v1', snapshotHash: sha256(SNAPSHOT.text),
  deterministic: Object.freeze(['schema', 'snapshot', 'catalog_values']),
  semantic: Object.freeze([
    Object.freeze({ id: 'faithfulness', threshold: 85, description: 'Summary accurately describes catalog availability and prices, without unsupported claims.' }),
    Object.freeze({ id: 'delivery_caveat', threshold: 85, description: 'Summary states prices exclude delivery and no delivery fee is provided.' }),
  ]),
});

/** Canonical JSON rejects undefined, non-finite numbers and non-JSON objects. */
export function canonicalJSON(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJSON(value[k])).join(',') + '}';
  throw Error('Expected finite JSON values');
}
export function sha256(value) { return createHash('sha256').update(typeof value === 'string' ? value : canonicalJSON(value)).digest('hex'); }
export const criteriaHash = sha256(CRITERIA);
export const artifactHash = artifact => sha256(artifact);
export const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));

const rows = Object.freeze([
  Object.freeze({ sku: 'A11', name: 'Cedar notebook', priceCents: 1250, available: true }),
  Object.freeze({ sku: 'B20', name: 'Steel bottle', priceCents: 2400, available: false }),
  Object.freeze({ sku: 'C31', name: 'Canvas pouch', priceCents: 875, available: true }),
]);
export function exampleArtifact(revision = 1) {
  return { revision, snapshotHash: CRITERIA.snapshotHash, source: SNAPSHOT.source, rows: rows.map(row => ({ ...row })), summary: 'The notebook costs $12.50 and the pouch $8.75; both are in stock. The $24.00 bottle is sold out. Prices exclude delivery, and no delivery fee is provided.' };
}

/** Failure categories are disjoint: invalid data is quality, instructions are safety. */
export function inspectArtifact(artifact) {
  let bytes;
  try { bytes = Buffer.byteLength(canonicalJSON(artifact)); } catch { return { outcome: 'quality_rejected', checks: [{ id: 'schema', passed: false }] }; }
  if (bytes <= 16384 && /(ignore\s+(all\s+)?(previous|prior|system)|system\s*prompt|override\s+(the\s+)?(judge|scor|instruction)|award\s+(every|all)\s+check|reveal\s+(secrets|keys))/i.test(canonicalJSON(artifact))) return { outcome: 'safety_rejected', checks: [{ id: 'instruction_safety', passed: false }] };
  const schema = bytes <= 16384 && exactKeys(artifact, ['revision', 'snapshotHash', 'source', 'rows', 'summary']) && Number.isSafeInteger(artifact.revision) && artifact.revision > 0 && typeof artifact.summary === 'string' && artifact.summary.length > 0 && artifact.summary.length <= 2048 && Array.isArray(artifact.rows) && artifact.rows.length === 3 && artifact.rows.every(row => exactKeys(row, ['sku', 'name', 'priceCents', 'available']) && typeof row.sku === 'string' && typeof row.name === 'string' && Number.isSafeInteger(row.priceCents) && row.priceCents > 0 && typeof row.available === 'boolean');
  const checks = [{ id: 'schema', passed: Boolean(schema) }];
  if (!schema) return { outcome: 'quality_rejected', checks };
  // Conservative gate. This is a bounded heuristic, not a complete injection detector.
  if (/(ignore\s+(all\s+)?(previous|prior|system)|system\s*prompt|override\s+(the\s+)?(judge|scor|instruction)|award\s+(every|all)\s+check|reveal\s+(secrets|keys))/i.test(artifact.summary)) return { outcome: 'safety_rejected', checks: [...checks, { id: 'instruction_safety', passed: false }] };
  checks.push({ id: 'snapshot', passed: artifact.snapshotHash === CRITERIA.snapshotHash && artifact.source === SNAPSHOT.source });
  checks.push({ id: 'catalog_values', passed: canonicalJSON(artifact.rows) === canonicalJSON(rows) });
  return { outcome: checks.every(check => check.passed) ? 'deterministic_pass' : 'quality_rejected', checks };
}
