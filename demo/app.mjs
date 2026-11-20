// First-party static receipt viewer. No wallet, signatures, API requests, or live claims.
const $ = id => document.getElementById(id);
const stages = ['Funded', 'Delivered', '90% released', 'Warranty claimed', 'Repair requested', 'Repair delivered', 'Resolved'];
const hashes = { original: null, repaired: null };
const original = { snapshot: 'catalog-2026-11-15-v1', summary: 'A11 and C31 are in stock at USD 12.50 and USD 8.75. B20 is sold out at USD 24.00. Delivery is excluded and its fee is unspecified.' };
const repaired = { ...original, summary: 'In stock: A11 (USD 12.50), C31 (USD 8.75). Sold out: B20 (USD 24.00). Prices exclude delivery. The catalog gives no delivery fee.' };
let receipt, imported = false;
const sha = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(x => x.toString(16).padStart(2, '0')).join('');
const set = (id, value) => { $(id).textContent = String(value ?? 'Not recorded'); };
const string = value => typeof value === 'string' ? value : value == null ? 'Not recorded' : JSON.stringify(value);
function rows(id, entries) { const root = $(id); root.replaceChildren(); for (const [key, value] of entries) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = key; dd.textContent = string(value); root.append(dt, dd); } }
function sol(value) { if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) return 'Not recorded'; const n = BigInt(value); if (n > 18446744073709551615n) return 'Not recorded'; return `${n / 1000000000n}.${String(n % 1000000000n).padStart(9, '0').replace(/0+$/, '') || '0'} SOL`; }
function reset() {
  imported = false;
  receipt = { evidenceMode: 'offline-example', state: 'Funded', stage: 0, revision: 0, network: 'Local simulation', task: 'example-extraction-001', credits: { paid: 0, held: 0, refunded: 0, escrow: 10 }, artifactHash: null, artifact: null, checks: [], deadlines: { delivery: 'Funding + 10 minutes', review: 'Funding + 15 minutes', warranty: 'Funding + 30 minutes', repair: 'Funding + 40 minutes', adjudication: 'Funding + 45 minutes' }, transactions: [], history: ['Funded'] };
  render();
}
function voteRows(checks) {
  const body = $('votes'); body.replaceChildren();
  if (!Array.isArray(checks) || !checks.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 5; td.textContent = 'No judge report recorded.'; tr.append(td); body.append(tr); return; }
  for (const check of checks.slice(0, 50).filter(check => check && typeof check === 'object')) { const tr = document.createElement('tr'); const votes = Array.isArray(check.votes) ? check.votes : []; for (const value of [check.id ?? check.name, votes[0], votes[1], votes[2], check.result]) { const td = document.createElement('td'); td.textContent = string(value); tr.append(td); } body.append(tr); }
}
function render() {
  set('mode', imported ? 'IMPORTED · UNVERIFIED' : 'OFFLINE EXAMPLE');
  set('mode-description', imported ? 'File contents only. This viewer does not verify signatures, chain state, or transaction execution.' : 'Illustrative workflow only. No transactions, wallet, or live AI calls.');
  set('notice', imported ? 'This file is displayed as supplied. Fixture votes and unsigned recommendations carry no payment authority.' : 'The example uses 10 demo credits. Amounts and judge votes are illustrative.');
  const amount = (name, lamports) => {
    if (imported) return sol(receipt[lamports]);
    const value = receipt.credits[name];
    return `${value} ${value === 1 ? 'credit' : 'credits'}`;
  };
  set('state', receipt.state); set('paid', amount('paid', 'paidLamports')); set('held', amount('held', 'heldLamports')); set('refunded', amount('refunded', 'refundedLamports'));
  set('balance-text', `Remaining escrow · ${amount('escrow', 'escrowLamports')}`); set('revision', `Revision ${receipt.revision ?? 'not recorded'}`);
  const identity = [['Network', receipt.network], ['Task', receipt.task], ['Artifact hash', receipt.artifactHash], ['Criteria hash', receipt.criteriaHash], ['Policy', receipt.policyVersion], ['Evidence', receipt.evidenceMode ?? 'Imported, unverified']];
  if (receipt.program) identity.push(['Program', receipt.program]);
  if (receipt.decision) identity.push(['Recommendation', receipt.decision], ['Report hash', receipt.reportHash]);
  if (receipt.chainRead?.mode === 'live-public-rpc-read') {
    identity.push(['Reported block', receipt.chainRead.blockNumber], ['USDC contract', receipt.chainRead.contract]);
  }
  rows('identity', identity);
  set('artifact-label', receipt.revision ? `Revision ${receipt.revision}` : 'Awaiting delivery'); set('artifact', receipt.artifact ? JSON.stringify(receipt.artifact, null, 2) : 'No artifact recorded.');
  voteRows(receipt.checks); rows('deadlines', Object.entries(receipt.deadlines && typeof receipt.deadlines === 'object' && !Array.isArray(receipt.deadlines) ? receipt.deadlines : { deadlines: 'Not recorded' }));
  const transactions = $('transactions'); transactions.replaceChildren();
  for (const tx of Array.isArray(receipt.transactions) ? receipt.transactions.slice(0, 100) : []) {
    const li = document.createElement('li'); const signature = typeof tx === 'string' ? tx : tx?.signature; const label = tx && typeof tx === 'object' ? tx.step ?? 'Transaction' : 'Transaction';
    if (typeof signature === 'string' && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature)) { const a = document.createElement('a'); a.href = `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`; a.rel = 'noopener noreferrer'; a.target = '_blank'; a.textContent = `${label} ↗ ${signature.slice(0, 12)}…`; li.append(a); } else li.textContent = `${label}: no valid signature recorded`; transactions.append(li);
  }
  if (!transactions.childElementCount) { const li = document.createElement('li'); li.textContent = imported ? 'No transaction signatures recorded in the supported receipt fields.' : 'No transactions. This is an offline example.'; transactions.append(li); }
  $('timeline').replaceChildren();
  for (const [i, stage] of stages.entries()) { const li = document.createElement('li'); li.textContent = stage; if (!imported && i <= receipt.stage) li.className = 'done'; if (imported && Array.isArray(receipt.history) && receipt.history.includes(stage)) li.className = 'done'; if (stage === 'Repair delivered') { const small = document.createElement('small'); small.textContent = 'Grade the revised artifact'; li.append(small); } $('timeline').append(li); }
  $('actions').replaceChildren();
  if (!imported) renderActions(); else { const p = document.createElement('p'); p.textContent = 'Imported receipts are read-only.'; $('actions').append(p); }
  set('raw', JSON.stringify(receipt.rawEnvelope ?? receipt, null, 2));
}
function action(label, fn, secondary = false) { const button = document.createElement('button'); button.textContent = label; if (secondary) button.className = 'secondary'; button.addEventListener('click', () => { fn(); render(); }); $('actions').append(button); }
function go(state, stage) { receipt.state = state; receipt.stage = stage; receipt.history.push(state); }
function settle(refund, state) { if (refund) receipt.credits.refunded = receipt.credits.held; else receipt.credits.paid = 10; receipt.credits.held = 0; receipt.credits.escrow = 0; go(state, 6); }
function checks(repair) { return [{ id: 'schema', votes: ['PASS', 'PASS', 'PASS'], result: 'PASS' }, { id: 'snapshot values', votes: ['PASS', 'PASS', 'PASS'], result: 'PASS' }, { id: 'semantic completeness', votes: repair ? ['98 / 100', '96 / 100', '99 / 100'] : ['92 / 100', '88 / 100', '70 / 100'], result: 'PASS · example' }]; }
function renderActions() {
  if (receipt.stage === 0) action('01 → Deliver artifact', () => { receipt.revision = 1; receipt.artifact = original; receipt.artifactHash = hashes.original; go('Delivered', 1); });
  if (receipt.stage === 1) action('02 → Verify & release 90%', () => { receipt.checks = checks(false); receipt.credits.paid = 9; receipt.credits.held = 1; receipt.credits.escrow = 1; go('90% released', 2); });
  if (receipt.stage === 2) { action('03 → Claim unclear delivery wording', () => go('Warranty claimed', 3)); action('Expire unclaimed warranty → pay hold', () => settle(false, 'Unclaimed warranty paid'), true); }
  if (receipt.stage === 3) { action('04 → Request one bounded repair', () => go('Repair requested', 4)); action('Dismiss unsupported claim → pay hold', () => settle(false, 'Claim dismissed'), true); action('Adjudication timeout → refund hold', () => settle(true, 'Timeout · hold refunded'), true); }
  if (receipt.stage === 4) { action('05 → Deliver repaired revision 2', () => { receipt.revision = 2; receipt.artifact = repaired; receipt.artifactHash = hashes.repaired; receipt.checks = []; go('Repair delivered', 5); }); action('Repair timeout → refund hold', () => settle(true, 'Repair timeout · hold refunded'), true); }
  if (receipt.stage === 5) { action('06 → Grade revision 2 & accept repair', () => { receipt.checks = checks(true); settle(false, 'Repair accepted'); }); action('Reject repair → refund hold', () => { receipt.checks = [{ id: 'semantic completeness', votes: ['FAIL', 'FAIL', 'PASS'], result: 'FAIL · example' }]; settle(true, 'Repair rejected · hold refunded'); }, true); action('Adjudication timeout → refund hold', () => settle(true, 'Timeout · hold refunded'), true); }
  if (receipt.stage === 6) action('Replay example ↺', reset);
}
$('reset').addEventListener('click', reset);
$('receipt-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 2_000_000) throw Error('Receipt is larger than 2 MB.');
    const raw = JSON.parse(await file.text());
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Receipt must be a JSON object.');
    const value = raw.receipt ?? raw.result?.receipt ?? raw;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid receipt object.');
    receipt = { ...value, rawEnvelope: raw }; imported = true; render();
  } catch (error) { set('notice', `Cannot open receipt: ${error instanceof SyntaxError ? 'Invalid JSON.' : error.message}`); }
  event.target.value = '';
});
reset();
Promise.all([sha(original), sha(repaired)]).then(([a,b]) => { hashes.original = a; hashes.repaired = b; if (!imported && receipt.revision) { receipt.artifactHash = receipt.revision === 1 ? a : b; render(); } }).catch(() => { /* Hashes remain explicitly unrecorded when Web Crypto is unavailable. */ });
