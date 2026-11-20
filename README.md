# UBC AgentEscrow

An agent can order a service within a preset budget and still have recourse if the result needs repair. AgentEscrow checks a catalog extraction before recommending payment and models a warranty that releases 90% up front and holds the remaining 10% until the claim window closes.

Built by **Cachetronaut** for UBC 2026, **Agentic Payments and AI**. The demo reads public testnet data and simulates payment. It uses fixture responses for AI judges and creates unsigned recommendations. No wallets, custody, payment transactions, or deployed AgentEscrow program are involved.

## Run the demo

Use Node.js 22 or newer from the repository root. No packages, API keys, wallet, build step, or server are required.

```sh
node --test tests/*.test.mjs
node scripts/demo.mjs > receipt.json
```

1. Open [demo/index.html](demo/index.html) from the downloaded repository in a browser. In the **Offline example**, deliver the artifact, release 90%, claim unclear delivery wording, request one repair, deliver revision 2, and accept it. Replay to exercise the timeout refund.
2. Choose **Open receipt JSON** and load `receipt.json`. This file contains the actual verifier output for five local fixture scenarios including the revision-two recommendation. Open **Inspect receipt JSON** to see the full scenarios, scores and report hashes. The viewer displays imported data as unverified.

To run the same checks after reading a real finalized block and the public USDC contract on Base Sepolia, use:

```sh
node scripts/demo.mjs --live-chain > receipt.json
```

This mode needs internet access to the public RPC. It checks the chain ID, then reads `decimals()` and `totalSupply()` at the same finalized block. It exits nonzero if any read or check fails. For an offline rehearsal, the [captured read and verifier reports](evidence/base-sepolia-read.json) can be imported instead. The read observes token metadata and supply. It does not verify a wallet balance, prove a payment, or authorize a transfer. [Circle’s Base USDC addresses](https://www.circle.com/multi-chain-usdc/base)

## How it works

The service has a fixed catalog snapshot and explicit scoring criteria. The verifier first checks exact schema, snapshot identity, prices, and inventory. For delivery and repair that pass these checks, each of two semantic criteria needs scores of at least 85 from at least two judges. All three judges must return valid responses. Safety or availability failures produce no recommendation. The artifact revision, criteria, decision, policy version, expiry and report hash are bound together.

The [architecture and agent decision loop](docs/ARCHITECTURE.md) specify what the demo executes, how the modeled spending controls and deadlines work, and where production signing and settlement would begin.

## Source and provenance

- [Service and verifier](lib/) contain the fixed snapshot, deterministic checks, judge-response parsing, quorum and report integrity. The original verifier’s production path is designed for a hosted inference endpoint. The submitted demo substitutes a local fixture for every model call.
- [Demo runner](scripts/demo.mjs) runs the verifier, tests five outcomes and optionally reads Base Sepolia. [Receipt viewer](demo/) replays the simulated warranty and displays evidence files.
- [Tests](tests/) cover the verifier and retained JavaScript codec from the earlier Solana design. Those codec tests use local inputs and mocked RPC. The active demo does not import the codec or sign or broadcast. The unbuilt Rust program and Solana deployment runner are outside this entry.

The UBC implementation began on November 15, 2026. An earlier AgentEscrow project supplied the design concept. The submission uses the UBC implementation, with its local demo and read-only preflight, rather than prior runtime code, deployments, or recordings.
