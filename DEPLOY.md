# VestingVault — Deployment & Testing Guide

## Deployed Contract (OPNet Testnet)

| Key | Value |
|-----|-------|
| Contract Address | `opt1sqz7835fzffpzmex6cc8f4snp0qkume08pukh3w87` |
| Network | OPNet Testnet (Signet fork) |
| Explorer | https://testnet.opnet.org/address/opt1sqz7835fzffpzmex6cc8f4snp0qkume08pukh3w87 |

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
5. The contract takes **constructor calldata** — you must provide two addresses:
   - `vestingToken`: the OP20 token address to be vested
   - `revenueToken`: the OP20 token address used for revenue distribution
6. Confirm the transaction — this creates 2 Bitcoin transactions (funding + reveal)
7. Wait for confirmation (~1-2 blocks on testnet)
8. Note the **contract address** from the deployment receipt

## Step 3: Post-Deployment Setup

Before using the vault, the **owner** must:

1. **Approve vestingToken** — Call `approve(vaultAddress, totalAmountToVest)` on the vesting token contract so the vault can pull tokens via `transferFrom`
2. **Add vesting schedules** — Call `addVesting(beneficiary, amount, cliffBlocks, vestingBlocks)` for each beneficiary

Before depositing revenue, the **depositor** must:

1. **Approve revenueToken** — Call `approve(vaultAddress, revenueAmount)` on the revenue token contract

---

## ABI Reference

The generated ABI is at `abis/VestingVault.abi.json`. Key selectors:

| Method | Selector | Type |
|--------|----------|------|
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

1. Deploy VestingVault with vestingToken + revenueToken addresses
2. Owner approves vault to spend vestingToken
3. Owner calls `addVesting(beneficiaryAddr, 1000e18, 10, 100)` — 10 block cliff, 100 block duration
4. Anyone approves vault to spend revenueToken, then calls `depositRevenue(500e18)`
5. Wait for blocks to pass the cliff (10+ blocks on testnet)
6. Beneficiary calls `release()` to claim vested tokens
7. Beneficiary calls `claimRevenue()` to claim revenue share
8. Query `getVestingInfo(beneficiary)` to verify state

See `test/test-vesting-flow.ts` for a scripted version.
