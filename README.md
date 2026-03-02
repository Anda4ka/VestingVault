# VestingVault — Vesting Dashboard with Revenue Share on Bitcoin L1

**On-chain token vesting with cliff/linear release + proportional revenue sharing for OP_20 tokens, deployed on OPNet (Bitcoin L1). No bridges, no L2, no EVM.**

> **Deployed contract (OPNet Testnet):** `opt1sqplya7jvr5ryduzsrlezps6gfcfznddmeyjghym6`
> [View on OPScan](https://opscan.org/accounts/opt1sqplya7jvr5ryduzsrlezps6gfcfznddmeyjghym6?network=op_testnet)

---

## What it does

VestingVault lets a protocol owner lock OP_20 tokens for beneficiaries under a configurable **linear vesting schedule** with an optional cliff period. Revenue deposited into the vault by anyone is distributed **proportionally** to all active vested holders based on their currently locked balance.

Revenue distribution uses the **Synthetix reward-per-token accumulator** pattern — O(1) per claim regardless of the number of beneficiaries.

```
Owner                Beneficiary           Anyone (depositor)
  │                      │                        │
  ├─ increaseAllowance()  │                        │
  ├─ addVesting() ───────►│                        │
  │   (locks tokens)      │                 increaseAllowance()
  │                       │                 depositRevenue()
  │                       │         (rewardPerToken accumulates)
  │                  [cliff passes]                │
  │                  release()                     │
  │                  claimRevenue()                │
```

---

## Live Dashboard

Open `website/index.html` in your browser with [OP Wallet](https://opwallet.io) extension installed.

The dashboard lets you interact with a deployed VestingVault contract entirely through your browser — no CLI required.

---

## Dashboard User Guide

### Prerequisites

- [OP Wallet](https://opwallet.io) browser extension installed and set to **OPNet Testnet**
- Some testnet BTC for transaction fees (each TX costs ~400 sat)
- Deployed VestingVault contract address
- Deployed VestingToken and RevenueToken addresses

---

### Step 1 — Connect Wallet

Open `website/index.html`. The page auto-connects to OP Wallet on load. You'll see:

```
✓ Wallet connected: opt1p...youraddress
✓ State refreshed
```

Your wallet address auto-fills in the **Your Wallet** field.

---

### Step 2 — Configure Contracts

Fill in the three address fields at the top of the dashboard:

| Field | What to enter |
|-------|--------------|
| **Vault Contract Address** | Your deployed VestingVault address (hex `0x...` or bech32 `opt1p...`) |
| **Vesting Token Address** | The OP_20 token being vested |
| **Revenue Token Address** | The OP_20 token used for revenue distribution |

Click **↻ Refresh** to load vault state. The four stat cards will populate.

---

### Step 3 — Initialize Vault (owner only, once)

> Skip this step if the vault is already initialized.

Go to **Add Vesting (Owner)** tab → **Initialize Vault** section.

The vault addresses auto-fill from your configuration. Click **Initialize Vault**.

This calls `initialize(vestingToken, revenueToken)` — a one-time setup required because OPNet currently has a known node bug where constructor calldata is 0 bytes on deploy.

---

### Step 4 — Mint Vesting Tokens (if needed)

Before adding a vesting schedule, the **vault owner must hold** the vesting tokens that will be locked.

If you deployed your own VestingToken, use its `mint(to, amount)` function (via OPScan or a separate script) to mint tokens to your wallet before proceeding.

> **Tip:** amounts are in full token units including decimals. For a token with 18 decimals, `1000000000000000000` = 1 token.

---

### Step 5 — Add a Vesting Schedule (owner only)

Go to **Add Vesting (Owner)** tab → **Add Vesting Entry** section.

| Field | Description | Example |
|-------|-------------|---------|
| **Beneficiary** | Address that will receive vested tokens | `opt1p...` or `0x...` |
| **Amount** | Tokens to lock (full decimals) | `1000000000000000000` |
| **Cliff (blocks)** | Blocks before any tokens unlock | `10` |
| **Duration (blocks)** | Total blocks for full vesting | `100` |

Click **Add Vesting**.

**What happens under the hood:**
1. `increaseAllowance(vault, amount)` — your wallet approves the vault to pull tokens
2. `addVesting(beneficiary, amount, cliff, duration)` — vault pulls tokens via `transferFrom` and records the schedule

> The second transaction simulates against **confirmed chain state**. The dashboard automatically retries until the allowance from step 1 is confirmed on-chain (up to 8 × 5s = 40 seconds). You'll see:
> ```
> ✓ increaseAllowance() TX: abc123...
> ℹ addVesting(): allowance not yet confirmed, retrying in 5s… (2/8)
> ✓ addVesting() simulation OK. Sending…
> ✓ addVesting() TX: def456...
> ```

After confirmation, the **Vesting Schedule** progress bar appears and **TOTAL LOCKED** updates.

---

### Step 6 — Release Vested Tokens (beneficiary)

Go to **Release & Claim** tab.

The dashboard shows:
- **YOUR RELEASABLE** — tokens available to claim right now
- **Vesting Schedule** — progress bar with `% vested`, start block, duration

Click **Release Tokens**. The contract transfers your currently releasable tokens to your wallet.

> Nothing is released before the cliff passes. After the cliff, tokens unlock linearly each block.

---

### Step 7 — Deposit Revenue (anyone)

Go to **Deposit Revenue** tab.

| Field | Description |
|-------|-------------|
| **Amount** | Revenue tokens to deposit (full decimals) |

Click **Deposit Revenue**. Same two-step flow as addVesting:
1. `increaseAllowance(vault, amount)` on the revenue token
2. `depositRevenue(amount)` — vault pulls and distributes

**REVENUE DEPOSITED** and **PENDING REVENUE** update after confirmation.

---

### Step 8 — Claim Revenue (beneficiary)

Go to **Release & Claim** tab.

**PENDING REVENUE** shows your accumulated share. Click **Claim Revenue**.

Your proportional share is calculated as:
```
pending = lockedBalance × (rewardPerToken − yourDebt) / 1e18
```

---

### Dashboard Stats at a Glance

| Card | Description |
|------|-------------|
| **TOTAL LOCKED** | All tokens currently locked across all beneficiaries |
| **REVENUE DEPOSITED** | Cumulative revenue deposited to the vault |
| **YOUR RELEASABLE** | Tokens you can release right now |
| **PENDING REVENUE** | Your unclaimed revenue share |

---

### Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| `Insufficient balance` | Your wallet has fewer tokens than `amount` | Mint tokens first (Step 4) |
| `no vesting schedule` | Your wallet address has no active vesting | Check beneficiary address matches your wallet |
| `only owner` | You're not the vault owner | Use the owner wallet |
| Stats show `0` after TX | TX not confirmed yet | Click **↻ Refresh** after ~2 minutes |

---

## How It Works — Mechanics

### Vesting schedule (block-based)

| Parameter | Description |
|-----------|-------------|
| `amount` | Total tokens to vest |
| `cliffDuration` | Blocks until any tokens unlock |
| `vestingDuration` | Total blocks for complete vesting |
| `startBlock` | Block height at `addVesting()` call |

Linear formula:
```
releasable = amount × (currentBlock − startBlock) / vestingDuration
             (only after cliff passes, capped at amount)
```

**Example:** 1 token, cliff=10 blocks, duration=100 blocks
- Block 10: 0 tokens releasable (cliff not passed)
- Block 20: 0.10 tokens releasable (10%)
- Block 60: 0.60 tokens releasable (60%)
- Block 110+: 1.00 tokens releasable (100%)

### Revenue distribution (Synthetix accumulator)

```
rewardPerToken += (depositAmount × 1e18) / totalLocked

pendingRevenue(user) = lockedBalance × (rewardPerToken − rewardDebt[user]) / 1e18
```

**Example:** Alice has 7000 locked, Bob has 3000 locked, someone deposits 1000 revenue tokens:
- `rewardPerToken += 1000 × 1e18 / 10000 = 1e17`
- Alice earns: `7000 × 1e17 / 1e18 = 700` ✓
- Bob earns: `3000 × 1e17 / 1e18 = 300` ✓

After `release()`, only the **remaining locked** balance earns future revenue.

---

## Security Design

| Property | Implementation |
|----------|---------------|
| Reentrancy guard | `StoredBoolean` in persistent blockchain storage (survives re-instantiation per call) |
| Checks-effects-interactions | State updated before every external `Blockchain.call()` |
| Only owner can add vesting | `onlyOwner()` guard on `addVesting()` |
| Revenue deposits open | Any address may deposit |
| No public mint/withdraw | Only `release()` + `claimRevenue()` for beneficiaries |
| `tx.sender` not `tx.origin` | Prevents delegation attacks |

---

## Contract Methods

### State-changing

| Method | Caller | Description |
|--------|--------|-------------|
| `initialize(vestingToken, revenueToken)` | Owner | One-time setup — sets token addresses post-deploy |
| `addVesting(beneficiary, amount, cliff, duration)` | Owner | Create vesting schedule, pull tokens via `transferFrom` |
| `release()` | Beneficiary | Release linearly vested tokens to caller |
| `depositRevenue(amount)` | Anyone | Deposit revenue for proportional distribution |
| `claimRevenue()` | Beneficiary | Claim accumulated revenue share |

### View

| Method | Returns |
|--------|---------|
| `releasableAmount(address)` | Tokens available to release now |
| `vestedBalance(address)` | Total vested so far (including already released) |
| `pendingRevenue(address)` | Unclaimed revenue (stored + current epoch) |
| `totalRevenueDeposited()` | Cumulative revenue deposited |
| `getVestingInfo(address)` | Full schedule: amount, startBlock, cliff, duration, released, releasable |
| `totalLocked()` | All currently locked tokens |
| `owner()` | Contract owner address |
| `vestingToken()` | Token being vested |
| `revenueToken()` | Token used for revenue |

### Function Selectors

| Function | Selector |
|----------|---------|
| `initialize(address,address)` | `0x67758e02` |
| `addVesting(address,uint256,uint256,uint256)` | `0x7361c073` |
| `release()` | `0xca66fa8a` |
| `depositRevenue(uint256)` | `0x5868922b` |
| `claimRevenue()` | `0xdba5add9` |
| `releasableAmount(address)` | `0x5ac042fa` |
| `vestedBalance(address)` | `0xa8a3c859` |
| `pendingRevenue(address)` | `0x23e7044e` |
| `totalRevenueDeposited()` | `0x86c091af` |
| `getVestingInfo(address)` | `0x2b302f16` |
| `owner()` | `0x3fc2bcdd` |
| `vestingToken()` | `0xea9b7f23` |
| `revenueToken()` | `0xa37f8d09` |
| `totalLocked()` | `0x885dc9b0` |

---

## Project Structure

```
src/
  VestingVault.ts          # Main contract (AssemblyScript / OPNet btc-runtime)
  VestingToken.ts          # Example vesting token (OP_20)
  RevenueToken.ts          # Example revenue token (OP_20)
  index.ts                 # OPNet entry point
  events/
    VestingEvents.ts       # NetEvent definitions
build/
  VestingVault.wasm        # Compiled binary (~30 KB)
  VestingVault.wat         # Human-readable WAT
abis/
  VestingVault.abi.json    # ABI (JSON)
  VestingVault.abi.ts      # ABI for opnet package
  VestingVault.d.ts        # TypeScript type definitions
  OP20.abi.ts              # Standard OP_20 ABI
test/
  test-vesting-flow.ts     # Full E2E test script
website/
  index.html               # Live dashboard (OP Wallet integration)
DEPLOY.md                  # Deployment guide
```

---

## Build

```bash
npm install

# Development build
npm run build

# Production build (optimized, no assertions)
npm run build:release
```

Outputs `build/VestingVault.wasm`.

---

## Deploy

See [DEPLOY.md](./DEPLOY.md) for the full guide.

**Quick summary:**

1. `npm run build:release`
2. Open **OP Wallet** → Switch to OPNet Testnet
3. Click **Deploy** → select `build/VestingVault.wasm`
4. Leave constructor calldata **empty** (OPNet node bug: calldata is 0 bytes on deploy)
5. Confirm the 2 Bitcoin transactions (fund + reveal)
6. Note the deployed contract address
7. Open `website/index.html`, enter the address, click **Initialize Vault**

---

## Events

| Event | Data |
|-------|------|
| `VestingAdded` | beneficiary, amount, cliffDuration, vestingDuration |
| `TokensReleased` | beneficiary, amount |
| `RevenueDeposited` | depositor, amount |
| `RevenueClaimed` | beneficiary, amount |

---

## Network

| Parameter | Value |
|-----------|-------|
| Network | OPNet Testnet (Signet fork) |
| RPC URL | `https://testnet.opnet.org` |
| Explorer | `https://opscan.org/?network=op_testnet` |
| Network constant | `networks.opnetTestnet` |

> Use `networks.opnetTestnet` — **not** `networks.testnet` (that's Testnet4, unsupported).

---

## License

MIT
