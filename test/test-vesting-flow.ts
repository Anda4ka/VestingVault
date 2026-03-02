/**
 * VestingVault — End-to-End Test Script (OPNet Testnet)
 *
 * Flow:
 *   0. Deploy contract (OP Wallet) — no constructor calldata needed
 *   1. Owner calls initialize(vestingToken, revenueToken)  ← NEW: one-time setup
 *   2. Owner approves vestingToken, then calls addVesting
 *   3. Depositor approves revenueToken, then calls depositRevenue
 *   4. Wait for blocks to pass the cliff
 *   5. Beneficiary calls release() to claim vested tokens
 *   6. Beneficiary calls claimRevenue() to claim revenue share
 *   7. Query getVestingInfo() to verify final state
 *
 * Prerequisites:
 *   - npm install opnet @btc-vision/bitcoin @btc-vision/transaction
 *   - Set the addresses below to match your deployed contracts
 *
 * IMPORTANT:
 *   - For FRONTEND (browser): signer=null, mldsaSigner=null (wallet handles signing)
 *   - For BACKEND (node):     signer=wallet.keypair, mldsaSigner=wallet.mldsaKeypair
 *   - This script is a BACKEND test script — it uses wallet keypairs directly
 *   - NEVER use raw PSBT. Always use getContract → simulate → sendTransaction.
 */
import { getContract, IOP20Contract, JSONRpcProvider, OP_20_ABI } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

import { VESTING_VAULT_ABI } from './vesting-vault-abi';

// ════════════════════════════════════════════════════════════════════════════
// CONFIGURATION — Replace these with your actual deployed addresses
// ════════════════════════════════════════════════════════════════════════════

const VAULT_ADDRESS          = 'opt1sqplya7jvr5ryduzsrlezps6gfcfznddmeyjghym6';    // ✅ deployed
const VESTING_TOKEN_ADDRESS  = 'bcrt1p...YOUR_VESTING_TOKEN_ADDRESS';              // TODO: fill
const REVENUE_TOKEN_ADDRESS  = 'bcrt1p...YOUR_REVENUE_TOKEN_ADDRESS';              // TODO: fill

// Your wallet address (p2tr taproot address)
const OWNER_ADDRESS          = 'bcrt1p...YOUR_OWNER_ADDRESS';                      // TODO: fill
const BENEFICIARY_ADDRESS    = 'bcrt1p...YOUR_BENEFICIARY_ADDRESS';                // TODO: fill

// Vesting parameters (in blocks)
const VESTING_AMOUNT = 1_000_000_000_000_000_000n; // 1e18 (1 token with 18 decimals)
const CLIFF_BLOCKS = 10n;  // ~10 blocks cliff
const VEST_BLOCKS = 100n;  // ~100 blocks total vesting duration

// Revenue deposit amount
const REVENUE_AMOUNT = 500_000_000_000_000_000n; // 0.5e18

// Transaction params (adjust gas/fees as needed)
const MAX_SAT_TO_SPEND = 50_000n;

// ════════════════════════════════════════════════════════════════════════════
// NETWORK — OPNet Testnet (Signet fork)
// CRITICAL: Use networks.opnetTestnet, NOT networks.testnet (Testnet4)
// ════════════════════════════════════════════════════════════════════════════

const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function log(step: string, msg: string): void {
    console.log(`[${step}] ${msg}`);
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN TEST FLOW
// ════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
    // 1. Set up provider and contract instances
    log('SETUP', `Connecting to ${RPC_URL}`);
    const provider = new JSONRpcProvider(RPC_URL, NETWORK);

    // VestingVault contract (custom ABI)
    const vault = getContract(
        VAULT_ADDRESS,
        VESTING_VAULT_ABI,
        provider,
        NETWORK,
        OWNER_ADDRESS,
    );

    // OP20 token contracts (standard ABI)
    const vestingToken = getContract<IOP20Contract>(
        VESTING_TOKEN_ADDRESS,
        OP_20_ABI,
        provider,
        NETWORK,
        OWNER_ADDRESS,
    );

    const revenueToken = getContract<IOP20Contract>(
        REVENUE_TOKEN_ADDRESS,
        OP_20_ABI,
        provider,
        NETWORK,
        OWNER_ADDRESS,
    );

    // ────────────────────────────────────────────────────────────────────
    // 2. Query initial state
    // ────────────────────────────────────────────────────────────────────
    log('QUERY', 'Fetching initial vault state...');

    const ownerResult = await vault.owner();
    log('QUERY', `Vault owner: ${ownerResult.decoded}`);

    const totalLockedResult = await vault.totalLocked();
    log('QUERY', `Total locked: ${totalLockedResult.decoded}`);

    const vtResult = await vault.vestingToken();
    log('QUERY', `Vesting token: ${vtResult.decoded}`);

    const rtResult = await vault.revenueToken();
    log('QUERY', `Revenue token: ${rtResult.decoded}`);

    // ────────────────────────────────────────────────────────────────────
    // 3. One-time initialize: set vestingToken + revenueToken addresses
    //    Must be called once by owner right after deployment.
    //    Skip this step if already initialized (vestingToken != zero).
    // ────────────────────────────────────────────────────────────────────
    const vtCheck = await vault.vestingToken();
    const vtAddr = vtCheck.decoded as string;
    const isInitialized = vtAddr && vtAddr !== '0x0000000000000000000000000000000000000000000000000000000000000000';

    if (!isInitialized) {
        log('INIT', `Initializing vault: vestingToken=${VESTING_TOKEN_ADDRESS}, revenueToken=${REVENUE_TOKEN_ADDRESS}`);

        const initSim = await vault.initialize(VESTING_TOKEN_ADDRESS, REVENUE_TOKEN_ADDRESS);
        if ('error' in initSim) {
            throw new Error(`initialize() simulation failed: ${initSim.error}`);
        }
        const initReceipt = await initSim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: OWNER_ADDRESS,
            maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
            network: NETWORK,
        });
        log('INIT', `initialize() TX sent. Hash: ${initReceipt}`);
    } else {
        log('INIT', `Already initialized. vestingToken=${vtAddr} — skipping.`);
    }

    // ────────────────────────────────────────────────────────────────────
    // 4. Owner approves vestingToken for the vault
    // ────────────────────────────────────────────────────────────────────
    log('STEP 1', `Approving vault to spend ${VESTING_AMOUNT} vestingTokens...`);

    const approveSim = await vestingToken.approve(VAULT_ADDRESS, VESTING_AMOUNT);
    if ('error' in approveSim) {
        throw new Error(`Approve simulation failed: ${approveSim.error}`);
    }
    log('STEP 1', 'Approve simulation OK. Sending transaction...');

    // BACKEND: use wallet.keypair and wallet.mldsaKeypair
    // FRONTEND: use signer: null, mldsaSigner: null
    const approveReceipt = await approveSim.sendTransaction({
        signer: null,           // Replace with wallet.keypair for backend
        mldsaSigner: null,      // Replace with wallet.mldsaKeypair for backend
        refundTo: OWNER_ADDRESS,
        maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
        network: NETWORK,
    });
    log('STEP 1', `Approve TX sent. Hash: ${approveReceipt}`);

    // ────────────────────────────────────────────────────────────────────
    // 4. Owner calls addVesting(beneficiary, amount, cliff, duration)
    // ────────────────────────────────────────────────────────────────────
    log('STEP 2', `Adding vesting: beneficiary=${BENEFICIARY_ADDRESS}, amount=${VESTING_AMOUNT}, cliff=${CLIFF_BLOCKS}, duration=${VEST_BLOCKS}`);

    const addVestingSim = await vault.addVesting(
        BENEFICIARY_ADDRESS,
        VESTING_AMOUNT,
        CLIFF_BLOCKS,
        VEST_BLOCKS,
    );
    if ('error' in addVestingSim) {
        throw new Error(`addVesting simulation failed: ${addVestingSim.error}`);
    }
    log('STEP 2', 'addVesting simulation OK. Sending transaction...');

    const addVestingReceipt = await addVestingSim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: OWNER_ADDRESS,
        maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
        network: NETWORK,
    });
    log('STEP 2', `addVesting TX sent. Hash: ${addVestingReceipt}`);

    // ────────────────────────────────────────────────────────────────────
    // 5. Verify vesting was created
    // ────────────────────────────────────────────────────────────────────
    log('VERIFY', 'Querying getVestingInfo after addVesting...');

    const vestingInfo = await vault.getVestingInfo(BENEFICIARY_ADDRESS);
    log('VERIFY', `Vesting info: ${JSON.stringify(vestingInfo.decoded, null, 2)}`);

    const totalLockedAfter = await vault.totalLocked();
    log('VERIFY', `Total locked after addVesting: ${totalLockedAfter.decoded}`);

    // ────────────────────────────────────────────────────────────────────
    // 6. Depositor approves revenueToken, then deposits revenue
    // ────────────────────────────────────────────────────────────────────
    log('STEP 3', `Approving vault to spend ${REVENUE_AMOUNT} revenueTokens...`);

    const revenueApproveSim = await revenueToken.approve(VAULT_ADDRESS, REVENUE_AMOUNT);
    if ('error' in revenueApproveSim) {
        throw new Error(`Revenue approve simulation failed: ${revenueApproveSim.error}`);
    }

    const revenueApproveReceipt = await revenueApproveSim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: OWNER_ADDRESS,
        maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
        network: NETWORK,
    });
    log('STEP 3', `Revenue approve TX sent. Hash: ${revenueApproveReceipt}`);

    log('STEP 4', `Depositing ${REVENUE_AMOUNT} revenue tokens...`);

    const depositSim = await vault.depositRevenue(REVENUE_AMOUNT);
    if ('error' in depositSim) {
        throw new Error(`depositRevenue simulation failed: ${depositSim.error}`);
    }

    const depositReceipt = await depositSim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: OWNER_ADDRESS,
        maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
        network: NETWORK,
    });
    log('STEP 4', `depositRevenue TX sent. Hash: ${depositReceipt}`);

    // ────────────────────────────────────────────────────────────────────
    // 7. Check pending revenue for beneficiary
    // ────────────────────────────────────────────────────────────────────
    log('VERIFY', 'Querying pendingRevenue for beneficiary...');

    const pendingRev = await vault.pendingRevenue(BENEFICIARY_ADDRESS);
    log('VERIFY', `Pending revenue: ${pendingRev.decoded}`);

    const totalRevDeposited = await vault.totalRevenueDeposited();
    log('VERIFY', `Total revenue deposited: ${totalRevDeposited.decoded}`);

    // ────────────────────────────────────────────────────────────────────
    // 8. Wait for cliff to pass (testnet blocks are ~10 min on Signet)
    // ────────────────────────────────────────────────────────────────────
    log('WAIT', `Waiting for cliff (${CLIFF_BLOCKS} blocks) to pass...`);
    log('WAIT', 'On testnet, each block takes ~10 minutes.');
    log('WAIT', 'You can monitor block height at https://opscan.org');
    log('WAIT', 'For testing, use a short cliff (e.g., 2-3 blocks).');

    // Poll releasable amount until something is available
    let releasable = 0n;
    let attempts = 0;
    while (releasable === 0n && attempts < 30) {
        await sleep(30_000); // Check every 30 seconds
        attempts++;

        const releasableResult = await vault.releasableAmount(BENEFICIARY_ADDRESS);
        releasable = releasableResult.decoded as bigint;
        log('POLL', `Attempt ${attempts}: releasable = ${releasable}`);
    }

    if (releasable === 0n) {
        log('WARN', 'Cliff not passed yet. Try running steps 9-10 manually later.');
        return;
    }

    // ────────────────────────────────────────────────────────────────────
    // 9. Beneficiary calls release() to claim vested tokens
    // ────────────────────────────────────────────────────────────────────

    // Switch sender to beneficiary for release() and claimRevenue()
    const vaultAsBeneficiary = getContract(
        VAULT_ADDRESS,
        VESTING_VAULT_ABI,
        provider,
        NETWORK,
        BENEFICIARY_ADDRESS,
    );

    log('STEP 5', 'Beneficiary calling release()...');

    const releaseSim = await vaultAsBeneficiary.release();
    if ('error' in releaseSim) {
        throw new Error(`release() simulation failed: ${releaseSim.error}`);
    }

    const releaseReceipt = await releaseSim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: BENEFICIARY_ADDRESS,
        maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
        network: NETWORK,
    });
    log('STEP 5', `release() TX sent. Hash: ${releaseReceipt}`);

    // ────────────────────────────────────────────────────────────────────
    // 10. Beneficiary calls claimRevenue() to claim revenue share
    // ────────────────────────────────────────────────────────────────────
    log('STEP 6', 'Beneficiary calling claimRevenue()...');

    const claimSim = await vaultAsBeneficiary.claimRevenue();
    if ('error' in claimSim) {
        throw new Error(`claimRevenue() simulation failed: ${claimSim.error}`);
    }

    const claimReceipt = await claimSim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: BENEFICIARY_ADDRESS,
        maximumAllowedSatToSpend: MAX_SAT_TO_SPEND,
        network: NETWORK,
    });
    log('STEP 6', `claimRevenue() TX sent. Hash: ${claimReceipt}`);

    // ────────────────────────────────────────────────────────────────────
    // 11. Final state check
    // ────────────────────────────────────────────────────────────────────
    log('FINAL', 'Querying final vault state...');

    const finalInfo = await vault.getVestingInfo(BENEFICIARY_ADDRESS);
    log('FINAL', `Vesting info: ${JSON.stringify(finalInfo.decoded, null, 2)}`);

    const finalLocked = await vault.totalLocked();
    log('FINAL', `Total locked: ${finalLocked.decoded}`);

    const finalPending = await vault.pendingRevenue(BENEFICIARY_ADDRESS);
    log('FINAL', `Pending revenue (should be 0): ${finalPending.decoded}`);

    const finalTotalRev = await vault.totalRevenueDeposited();
    log('FINAL', `Total revenue deposited: ${finalTotalRev.decoded}`);

    log('DONE', 'Test flow complete!');
}

main().catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
});
