# Receipt viewer

Open [index.html](index.html) directly in a browser. The interactive example starts funded with 10 demo credits. It models delivery, a 9-credit release, a 1-credit warranty hold and a single repair. Replaying the example lets you inspect dismissal and timeout refunds. Its balance changes and votes are illustrative.

Use **Open receipt JSON** with the JSON from `node scripts/demo.mjs` or the [captured Base Sepolia read](../evidence/base-sepolia-read.json). The import shows the revision-two recommendation, artifact and criteria hashes, per-check fixture votes, and the reported block and USDC contract if the read was enabled. **Inspect receipt JSON** shows the full input, including the quality, safety and outage scenarios. Import is read-only and the contents remain unverified.

The viewer accepts a receipt object at the JSON root, under `receipt` or under `result.receipt`. Legacy imported lamport fields and devnet transaction links are supported for display. The current demo generates no transaction signatures and records no paid balance.
