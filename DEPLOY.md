# VestingVault — Deployment & Testing Guide

## Deployed Contract (OPNet Testnet)

| Key | Value |
|-----|-------|
| Contract Address | `opt1...YOUR_NEW_VAULT_ADDRESS` ← update after fresh deploy |
| Network | OPNet Testnet (Signet fork) |
| Explorer | https://opscan.org ← paste your address there |

> **Note:** Previous address `opt1sqz7835fzffpzmex6cc8f4snp0qkume08pukh3w87` was from a failed deploy (MLDSA error). New deploy needed with updated WASM.

---

## Prerequisites

1. **OP_WALLET** browser extension installed ([https://opwallet.org](https://opwallet.org))
2. **Testnet sats** — Use the OPNet testnet faucet to fund your wallet
3. **Two OP20 tokens deployed on testnet** — one for vesting, one for revenue
4. **Node.js 18+** and **npm** installed

## Network Configuration

| Parameter | Value |
|-----------|-------|
| Network | OPNet Testnet (Signet fork) |
| RPC URL | `https://testnet.opnet.org` |
| Network constant | `networks.opnetTestnet` from `@btc-vision/bitcoin` |

> **CRITICAL:** Use `networks.opnetTestnet` — NOT `networks.testnet` (that is Testnet4, unsupported by OPNet).

---

## Step 1: Build the Contract

```bash
npm install
npm run build
```

This produces `build/VestingVault.wasm` (~29 KB).

## Step 2: Deploy via OP_WALLET

1. Open **OP_WALLET** extension in your browser
2. Switch to **OPNet Testnet** network
3. Click the **"Deploy"** option
4. Drag `build/VestingVault.wasm` into the upload area (or click to browse)
5. **Leave constructor calldata EMPTY** — Known OPNet testnet bug: the node passes 0 bytes to `onDeploy()`, so reading calldata would crash the contract. Token addresses are configured in Step 3 instead.
6. Confirm the transaction — this creates 2 Bitcoin transactions (funding + reveal)
7. Wait for confirmation (~1-2 blocks on testnet)
8. Note the **contract address** from the deployment receipt

## Step 3: Initialize (one-time)

**Immediately after deployment**, the owner must call `initialize(vestingToken, revenueToken)`:

- Sets the vesting token and revenue token permanently
- Can only be called once — replay-protected (reverts if already initialized)
- Reverts if either address is zero

```ts
await vault.initialize(VESTING_TOKEN_ADDRESS, REVENUE_TOKEN_ADDRESS);
```

This can be done via:
- The **website dashboard** → Admin tab → "Initialize Vault" button
- The test script (`test/test-vesting-flow.ts`) — auto-detects if needed
- OP Wallet directly using selector `0x67758e02`

## Step 4: Post-Initialization Setup

Before using the vault, the **owner** must:

1. **Approve vestingToken** — Call `increaseAllowance(vaultAddress, totalAmountToVest)` on the vesting token so the vault can pull tokens via `transferFrom`
2. **Add vesting schedules** — Call `addVesting(beneficiary, amount, cliffBlocks, vestingBlocks)` for each beneficiary

Before depositing revenue, the **depositor** must:

1. **Approve revenueToken** — Call `increaseAllowance(vaultAddress, revenueAmount)` on the revenue token contract

---

## ABI Reference

The generated ABI is at `abis/VestingVault.abi.json`. Key selectors:

| Method | Selector | Type |
|--------|----------|------|
| `initialize(address,address)` | `0x67758e02` | Write (one-time) |
| `addVesting(address,uint256,uint256,uint256)` | `0x7361c073` | Write |
| `release()` | `0xca66fa8a` | Write |
| `depositRevenue(uint256)` | `0x5868922b` | Write |
| `claimRevenue()` | `0xdba5add9` | Write |
| `releasableAmount(address)` | `0x5ac042fa` | View |
| `vestedBalance(address)` | `0xa8a3c859` | View |
| `pendingRevenue(address)` | `0x23e7044e` | View |
| `totalRevenueDeposited()` | `0x86c091af` | View |
| `getVestingInfo(address)` | `0x2b302f16` | View |
| `owner()` | `0x3fc2bcdd` | View |
| `vestingToken()` | `0xea9b7f23` | View |
| `revenueToken()` | `0xa37f8d09` | View |
| `totalLocked()` | `0x885dc9b0` | View |

---

## Test Flow

The recommended test sequence:

1. Deploy VestingVault (no calldata)
2. Owner calls `initialize(vestingToken, revenueToken)`  ← one-time setup
3. Owner approves vault to spend vestingToken
4. Owner calls `addVesting(beneficiaryAddr, 1000e18, 10, 100)` — 10 block cliff, 100 block duration
5. Anyone approves vault to spend revenueToken, then calls `depositRevenue(500e18)`
6. Wait for blocks to pass the cliff (10+ blocks on testnet)
7. Beneficiary calls `release()` to claim vested tokens
8. Beneficiary calls `claimRevenue()` to claim revenue share
9. Query `getVestingInfo(beneficiary)` to verify state

See `test/test-vesting-flow.ts` for a scripted version.
