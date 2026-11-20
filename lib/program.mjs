import { SYSTEM, GENESIS, pubkey, decode58, uint, i64, findPda, base58 } from './solana.mjs';
const account = (address, signer = false, writable = false) => ({ address, signer, writable });
const hash = v => { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v) || /^0+$/.test(v)) throw Error('Expected nonzero SHA256'); return Buffer.from(v, 'hex'); };
export const budgetAddress = (program, owner, nonce) => findPda([Buffer.from('budget'), pubkey(owner), uint(nonce)], program).address;
export const taskAddress = (program, budget, nonce) => findPda([Buffer.from('task'), pubkey(budget), uint(nonce)], program).address;
export function instruction(program, kind, v) {
  let data, accounts;
  if (kind === 'createBudget') {
    data = [uint(0, 1), uint(v.nonce), pubkey(v.agent), pubkey(v.worker), uint(v.budget), uint(v.maxJob), i64(v.expiry)];
    accounts = [account(v.owner, true, true), account(v.budgetPda, false, true), account(SYSTEM)];
  } else if (kind === 'revoke' || kind === 'withdraw') {
    data = [uint(kind === 'revoke' ? 1 : 2, 1)]; accounts = [account(v.owner, true, kind === 'withdraw'), account(v.budgetPda, false, true)];
  } else if (kind === 'fund') {
    data = [uint(3, 1), uint(v.nonce), pubkey(v.verifier), hash(v.criteriaHash), uint(v.price), ...['quoteExpiry', 'delivery', 'review', 'warranty', 'repair', 'adjudication'].map(k => i64(v[k])), uint(v.policyVersion, 4)];
    accounts = [account(v.agent, true, true), account(v.worker, true), account(v.budgetPda, false, true), account(v.task, false, true), account(SYSTEM)];
  } else if (kind === 'deliver' || kind === 'repair') {
    data = [uint(kind === 'deliver' ? 4 : 7, 1), hash(v.artifactHash)]; accounts = [account(v.worker, true), account(v.task, false, true)];
  } else if (kind === 'verdict') {
    const decisions = { release: 0, refund: 1, dismiss: 2, request_repair: 3, accept_repair: 4 };
    if (!Object.hasOwn(decisions, v.decision) || v.network !== 'solana-devnet' || v.genesisHash !== GENESIS || v.program !== program) throw Error('Invalid verdict domain');
    data = [uint(5, 1), decode58(GENESIS), pubkey(program), pubkey(v.task), uint(v.revision, 4), hash(v.artifactHash), hash(v.criteriaHash), uint(decisions[v.decision], 1), uint(v.policyVersion, 4), i64(v.expiry), hash(v.reportHash)];
    accounts = [account(v.verifier, true), account(v.task, false, true), account(v.owner, false, true), account(v.worker, false, true)];
  } else if (kind === 'claim') {
    data = [uint(6, 1), hash(v.evidenceHash)]; accounts = [account(v.owner, true), account(v.task, false, true)];
  } else if (kind === 'settle') {
    data = [uint(8, 1)]; accounts = [account(v.task, false, true), account(v.owner, false, true), account(v.worker, false, true)];
  } else throw Error('Unknown instruction');
  return { program, accounts, data: Buffer.concat(data) };
}
export function readTask(data) {
  const b = Buffer.from(data); if (b.length !== 512 || b[0] !== 2) throw Error('Invalid task state');
  let pos = 1; const take = n => { const v = b.subarray(pos, pos + n); pos += n; return v; };
  const result = { nonce: take(8).readBigUInt64LE().toString() };
  for (const k of ['budget', 'owner', 'worker', 'verifier']) result[k] = base58(take(32));
  for (const k of ['criteriaHash', 'artifactHash', 'claimHash', 'reportHash']) result[k] = take(32).toString('hex');
  for (const k of ['price', 'held', 'paid', 'refunded']) result[k] = take(8).readBigUInt64LE().toString();
  result.deadlines = {}; for (const k of ['delivery', 'review', 'warranty', 'repair', 'adjudication']) result.deadlines[k] = take(8).readBigInt64LE().toString();
  result.policyVersion = take(4).readUInt32LE(); result.revision = take(4).readUInt32LE();
  const state = take(1)[0]; result.state = ['Funded', 'Delivered', 'Warranty', 'Claimed', 'RepairRequested', 'RepairDelivered', 'Paid', 'Refunded'][state];
  if (!result.state) throw Error('Invalid task state enum'); result.repairUsed = take(1)[0] === 1; return result;
}
