// Fresh first-party legacy Solana codec. Node built-ins only; no downloaded SDK.
import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
export const RPC = 'https://api.devnet.solana.com';
export const GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const SYSTEM = '11111111111111111111111111111111';
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
  bytes = Buffer.from(bytes); let n = BigInt('0x' + (bytes.toString('hex') || '0')), out = '';
  while (n) { out = alphabet[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b) break; out = '1' + out; } return out;
}
export function decode58(value) {
  if (typeof value !== 'string' || !value.length || value.length > 128) throw Error('Invalid base58');
  let n = 0n; for (const c of value) { const i = alphabet.indexOf(c); if (i < 0) throw Error('Invalid base58'); n = n * 58n + BigInt(i); }
  let hex = n ? n.toString(16) : ''; if (hex.length % 2) hex = '0' + hex;
  return Buffer.concat([Buffer.alloc(value.match(/^1*/)[0].length), Buffer.from(hex, 'hex')]);
}
export function pubkey(value) { const b = typeof value === 'string' ? decode58(value) : Buffer.from(value); if (b.length !== 32) throw Error('Expected 32-byte public key'); return b; }
function integer(value) { if (typeof value === 'number' && !Number.isSafeInteger(value)) throw Error('Unsafe numeric integer'); if (!['bigint','number','string'].includes(typeof value) || typeof value === 'string' && !/^-?(0|[1-9][0-9]*)$/.test(value)) throw Error('Expected exact integer'); return BigInt(value); }
export function uint(value, size = 8) { const n = integer(value); if (n < 0n || n >= 1n << BigInt(size * 8)) throw Error('Unsigned integer range'); const b = Buffer.alloc(size); let x = n; for (let i = 0; i < size; i++) { b[i] = Number(x & 255n); x >>= 8n; } return b; }
export function i64(value) { const n = integer(value); if (n < -(1n << 63n) || n >= 1n << 63n) throw Error('Signed integer range'); const b = Buffer.alloc(8); b.writeBigInt64LE(n); return b; }
export function shortvec(n) { if (!Number.isSafeInteger(n) || n < 0 || n > 65535) throw Error('Invalid compact length'); const b = []; do { const v = n & 127; n >>>= 7; b.push(v | (n ? 128 : 0)); } while (n); return Buffer.from(b); }
export function keyFromSeed(seed) {
  if (!Buffer.isBuffer(seed) || seed.length !== 32) throw Error('Expected seed bytes');
  const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  const publicBytes = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);
  return { privateKey, publicBytes, address: base58(publicBytes) };
}
export const ephemeralKey = () => keyFromSeed(randomBytes(32));
export function envKey(name) { const v = process.env[name]; if (!v || !/^[a-f0-9]{64}$/.test(v)) throw Error(`Missing ${name}: expected environment-only 32-byte hex seed`); return keyFromSeed(Buffer.from(v, 'hex')); }
const p = (1n << 255n) - 19n;
const mod = x => ((x % p) + p) % p;
function pow(x, n) { let v = 1n; for (x = mod(x); n; n >>= 1n, x = mod(x * x)) if (n & 1n) v = mod(v * x); return v; }
const d = mod(-121665n * pow(121666n, p - 2n));
export function isOnCurve(bytes) {
  const b = Buffer.from(bytes); if (b.length !== 32) return false;
  b[31] &= 127; let y = 0n; for (let i = 31; i >= 0; i--) y = (y << 8n) + BigInt(b[i]);
  // curve25519-dalek decompress masks the sign and reduces field bytes.
  y = mod(y); const yy = mod(y * y), denominator = mod(d * yy + 1n);
  if (!denominator) return false;
  const xx = mod((yy - 1n) * pow(denominator, p - 2n));
  return xx === 0n || pow(xx, (p - 1n) / 2n) === 1n;
}
export function findPda(seeds, program) {
  if (seeds.length > 15 || seeds.some(s => Buffer.from(s).length > 32)) throw Error('Invalid PDA seeds');
  for (let bump = 255; bump >= 0; bump--) {
    const bytes = createHash('sha256').update(Buffer.concat([...seeds.map(s => Buffer.from(s)), Buffer.from([bump]), pubkey(program), Buffer.from('ProgramDerivedAddress')])).digest();
    if (!isOnCurve(bytes)) return { address: base58(bytes), bump };
  } throw Error('No PDA bump');
}
export function transaction({ payer, keys, blockhash, instructions }) {
  const entries = new Map(); const add = (address, signer, writable) => {
    pubkey(address); const prev = entries.get(address); entries.set(address, { address, signer: signer || prev?.signer || false, writable: writable || prev?.writable || false });
  };
  add(payer, true, true);
  for (const ix of instructions) { for (const a of ix.accounts) add(a.address, a.signer, a.writable); add(ix.program, false, false); }
  const ordered = [...entries.values()].sort((a, b) => a.address === payer ? -1 : b.address === payer ? 1 : Number(b.signer) - Number(a.signer) || Number(b.writable) - Number(a.writable));
  if (ordered.length > 256) throw Error('Too many accounts');
  const index = a => ordered.findIndex(k => k.address === a);
  const signers = ordered.filter(k => k.signer);
  const message = Buffer.concat([Buffer.from([signers.length, signers.filter(k => !k.writable).length, ordered.filter(k => !k.signer && !k.writable).length]), shortvec(ordered.length), ...ordered.map(k => pubkey(k.address)), pubkey(blockhash), shortvec(instructions.length), ...instructions.map(ix => Buffer.concat([Buffer.from([index(ix.program)]), shortvec(ix.accounts.length), Buffer.from(ix.accounts.map(a => index(a.address))), shortvec(ix.data.length), ix.data]))]);
  const signatures = signers.map(s => { const key = keys.find(k => k.address === s.address); if (!key) throw Error('Missing transaction signer'); const signature = sign(null, message, key.privateKey); if (!verify(null, message, createPublicKey(key.privateKey), signature)) throw Error('Signature self-check failed'); return signature; });
  const bytes = Buffer.concat([shortvec(signatures.length), ...signatures, message]); if (bytes.length > 1232) throw Error('Transaction exceeds packet size');
  return { bytes, signature: base58(signatures[0]) };
}
export async function rpc(method, params = []) {
  const response = await fetch(RPC, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw Error(`Devnet HTTP ${response.status}`);
  const data = await response.json(); if (data.error) throw Error(`Devnet RPC ${data.error.code}`); if (!Object.hasOwn(data, 'result')) throw Error('Malformed RPC'); return data.result;
}
export async function assertDevnet() { if (await rpc('getGenesisHash') !== GENESIS) throw Error('Wrong cluster: signing refused'); }
export async function send({ payer, keys, instructions, onPrepared = async () => {} }) {
  await assertDevnet(); const { value } = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const signed = transaction({ payer, keys, instructions, blockhash: value.blockhash });
  const pending = { signature: signed.signature, lastValidBlockHeight: value.lastValidBlockHeight, url: `https://explorer.solana.com/tx/${signed.signature}?cluster=devnet` };
  await onPrepared(pending);
  // Broadcast once only. An unknown result must be reconciled by signature, never blindly retried.
  let signature;
  try { signature = await rpc('sendTransaction', [signed.bytes.toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 0 }]); }
  catch { const error = new Error(`Unresolved broadcast; reconcile ${signed.signature}`); error.pendingTransaction = pending; throw error; }
  if (signature !== signed.signature) throw Error('Unexpected RPC signature');
  return { signature, lastValidBlockHeight: value.lastValidBlockHeight, url: `https://explorer.solana.com/tx/${signature}?cluster=devnet` };
}
export async function confirm(signature) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const { value } = await rpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
    if (value[0]?.err) throw Error('Transaction failed onchain');
    if (['confirmed', 'finalized'].includes(value[0]?.confirmationStatus)) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  } throw Error(`Unresolved transaction; reconcile ${signature}`);
}
