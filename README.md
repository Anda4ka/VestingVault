# VestingVault — Vesting Dashboard with Revenue Share on Bitcoin L1

**On-chain vesting with cliff/linear release + proportional revenue sharing for OP_20 tokens, deployed on OPNet (Bitcoin L1). No bridges, no L2.**

> **Deployed contract (OPNet Testnet):** `opt1sqplya7jvr5ryduzsrlezps6gfcfznddmeyjghym6`
> [View on Explorer](https://opscan.org/address/opt1sqplya7jvr5ryduzsrlezps6gfcfznddmeyjghym6)

---

## What it does

VestingVault lets a protocol owner lock OP_20 tokens for beneficiaries under a configurable linear vesting schedule (with optional cliff). Protocol revenue deposited into the vault is distributed **proportionally** to all vested holders based on their currently locked token balance.

The revenue distribution uses the **Synthetix reward-per-token accumulator** pattern — O(1) per claim regardless of the number of beneficiaries. No loops, no unbounded gas.

```
Owner                Beneficiary           Anyone (depositor)
  │                      │                        │
  ├─ approve()           │                        │
  ├─ addVesting() ───────►                        │
  │   (locks tokens)     │                   approve()
  │                      │              depositRevenue()
  │                      │      (rewardPerToken accumulates)
  │                 [cliff passes]               │
  │                 release() ────────────────── │
  │                 claimRevenue() ──────────────│
```

---

## Mechanics

### Vesting schedule (block-based)

| Parameter | Description |
|-----------|-------------|
| `amount` | Total tokens to vest |
| `cliffDuration` | Blocks until vesting starts |
| `vestingDuration` | Total blocks for full vesting |
| `startBlock` | Block at `addVesting()` call |

Linear formula: `vested = amount × (currentBlock − start) / duration`

Before the cliff: nothing is releasable. After full duration: everything is releasable.

### Revenue distribution (Synthetix-style accumulator)

```
rewardPerToken += (depositAmount × 1e18) / totalLocked

pendingRevenue(user) = lockedBalance × (rewardPerToken − rewardDebt[user]) / 1e18
```

Math example:
- Alice: 7 000 locked, Bob: 3 000 locked → `totalLocked = 10 000`
- `depositRevenue(1 000)` → `rewardPerToken += 1 000×1e18 / 10 000 = 1e17`
- Alice earns: `7 000 × 1e17 / 1e18 = 700` ✓
- Bob earns: `3 000 × 1e17 / 1e18 = 300` ✓
- Total: 1 000 = deposited amount ✓

After `release()`: only the **remaining locked** balance earns future revenue.

---

## Security design

| Property | Implementation |
|----------|---------------|
| Reentrancy guard | `StoredBoolean` in persistent blockchain storage (not in-memory — survives re-instantiation per call) |
| Checks-effects-interactions | State updated before every external `Blockchain.call()` |
| Only owner can add vesting | `onlyOwner()` guard on `addVesting()` |
| Revenue deposits open | Any address may deposit (protocol composability) |
| No public mint/withdraw | Only `release()` + `claimRevenue()` for beneficiaries |
| `tx.sender` (not `tx.origin`) | Prevents delegation attacks |

---

## Contract methods

### State-changing

| Method | Caller | Description |
|--------|--------|-------------|
| `initialize(vestingToken, revenueToken)` | Owner | **One-time setup** — sets token addresses after deploy (workaround for testnet 0-byte calldata bug) |
| `addVesting(beneficiary, amount, cliff, duration)` | Owner | Create vesting schedule, pull tokens via `transferFrom` |
| `release()` | Beneficiary | Release vested tokens to caller |
| `depositRevenue(amount)` | Anyone | Deposit revenue for proportional distribution |
| `claimRevenue()` | Beneficiary | Claim accumulated revenue share |

### View

| Method | Returns |
|--------|---------|
| `releasableAmount(address)` | Tokens available to release now |
| `vestedBalance(address)` | Total vested so far |
| `pendingRevenue(address)` | Unclaimed revenue (stored + current epoch) |
| `totalRevenueDeposited()` | Cumulative revenue deposited |
| `getVestingInfo(address)` | Full schedule info in one call |
| `owner()` | Contract owner address |
| `vestingToken()` | Token being vested |
| `revenueToken()` | Token used for revenue |
| `totalLocked()` | All currently locked tokens |

### Function selectors

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

## Project structure

```
src/
  VestingVault.ts          # Main contract (AssemblyScript)
  index.ts                 # OPNet entry point
  events/
    VestingEvents.ts       # NetEvent definitions
build/
  VestingVault.wasm        # Compiled binary (~30 KB)
  VestingVault.wat         # Human-readable WAT
abis/
  VestingVault.abi.json    # Auto-generated ABI
  VestingVault.abi.ts      # ABI for opnet package
  VestingVault.d.ts        # TypeScript type definitions
test/
  test-vesting-flow.ts     # Full E2E test script
  vesting-vault-abi.ts     # Typed ABI for tests
frontend/
  index.html               # Minimal dashboard (OP Wallet)
DEPLOY.md                  # Deployment guide
```

---

## Build

```bash
npm install

# Development build (with assertions)
npm run build

# Production build (optimized, no assertions)
npm run build:release
```

Outputs `build/VestingVault.wasm`.

---

## Deploy

See [DEPLOY.md](./DEPLOY.md) for the full step-by-step guide.

**Quick summary:**

1. Build the contract (`npm run build`)
2. Open **OP Wallet** → Switch to OPNet Testnet
3. Click **Deploy** → drag `build/VestingVault.wasm`
4. **No constructor calldata needed** — leave it empty (known OPNet node bug: calldata is 0 bytes on deploy)
5. Confirm the 2 BTC transactions (fund + reveal)
6. Note the deployed contract address
7. Call `initialize(vestingToken, revenueToken)` once as owner — sets token addresses post-deploy

---

## Test the full flow (E2E)

Edit `test/test-vesting-flow.ts` — fill in the deployed addresses:

```ts
const VAULT_ADDRESS = 'bcrt1p...YOUR_VAULT_ADDRESS';
const VESTING_TOKEN_ADDRESS = 'bcrt1p...YOUR_TOKEN_ADDRESS';
const REVENUE_TOKEN_ADDRESS = 'bcrt1p...YOUR_REVENUE_TOKEN_ADDRESS';
const OWNER_ADDRESS = 'bcrt1p...YOUR_OWNER_ADDRESS';
const BENEFICIARY_ADDRESS = 'bcrt1p...YOUR_BENEFICIARY_ADDRESS';
```

Then run each step:

```
Step 0: Deploy contract (no calldata) — note the new vault address
Step 1: Owner calls initialize(vestingToken, revenueToken)  ← one-time setup
Step 2: Owner approves vestingToken
Step 3: Owner calls addVesting()
Step 4: Depositor approves revenueToken
Step 5: Depositor calls depositRevenue()
Step 6: [Wait for cliff blocks to pass on testnet]
Step 7: Beneficiary calls release()
Step 8: Beneficiary calls claimRevenue()
Step 9: Verify getVestingInfo() / pendingRevenue() == 0
```

Expected state after full flow:
- `totalLocked` = original amount minus released
- `pendingRevenue(beneficiary)` = 0 (claimed)
- `totalRevenueDeposited()` = total deposited

---

## Expected math verification

Given: `vestingAmount = 1e18`, `revenueDeposited = 0.5e18`, `totalLocked = 1e18`, single beneficiary:

```
rewardPerToken = 0.5e18 × 1e18 / 1e18 = 5e17
pendingRevenue = 1e18 × 5e17 / 1e18 = 0.5e18  ✓ (100% of revenue)
```

Given: two beneficiaries (Alice 70%, Bob 30%), `revenueDeposited = 1000`:

```
rewardPerToken += 1000 × 1e18 / totalLocked
Alice pending = lockedAlice × rewardPerToken / 1e18 = 700  ✓
Bob pending   = lockedBob   × rewardPerToken / 1e18 = 300  ✓
```

---

## Events

| Event | Data |
|-------|------|
| `VestingAdded` | beneficiary, amount, cliff, duration |
| `TokensReleased` | beneficiary, amount |
| `RevenueDeposited` | depositor, amount |
| `RevenueClaimed` | beneficiary, amount |

---

## Network

| Parameter | Value |
|-----------|-------|
| Network | OPNet Testnet (Signet fork) |
| RPC URL | `https://testnet.opnet.org` |
| Network constant | `networks.opnetTestnet` |

> Use `networks.opnetTestnet` — NOT `networks.testnet` (Testnet4, unsupported).

---

## License

MIT
