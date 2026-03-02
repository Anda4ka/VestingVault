import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    encodeSelector,
    OP_NET,
    Revert,
    SafeMath,
    StoredU256,
    StoredBoolean,
    StoredAddress,
    AddressMemoryMap,
    EMPTY_POINTER,
} from '@btc-vision/btc-runtime/runtime';
import { CallResult } from '@btc-vision/btc-runtime/runtime/env/BlockchainEnvironment';

import {
    VestingAddedEvent,
    TokensReleasedEvent,
    RevenueDepositedEvent,
    RevenueClaimedEvent,
} from './events/VestingEvents';

/**
 * VestingVault — Vesting Dashboard with Revenue Share on OPNet (Bitcoin L1).
 *
 * Allows an owner to create linear vesting schedules (with cliff) for beneficiaries.
 * Protocol revenue deposited into the vault is distributed proportionally to all
 * vested holders based on their currently locked token balance.
 *
 * Revenue-per-token accumulator pattern (Synthetix-style) ensures O(1) distribution
 * with no loops over beneficiary lists.
 */
@final
export class VestingVault extends OP_NET {
    // OP20 selectors (full method signatures per OPNet convention)
    private static readonly TRANSFER_SELECTOR: u32 = encodeSelector('transfer(address,uint256)');
    private static readonly TRANSFER_FROM_SELECTOR: u32 = encodeSelector(
        'transferFrom(address,address,uint256)',
    );

    // Precision multiplier for reward-per-token math (1e18).
    private static readonly PRECISION: u256 = u256.fromString('1000000000000000000');

    // Global storage pointers (reentrancy lock MUST be persistent storage, not a class field)
    private readonly lockedPointer: u16 = Blockchain.nextPointer;
    private readonly ownerPointer: u16 = Blockchain.nextPointer;
    private readonly vestingTokenPointer: u16 = Blockchain.nextPointer;
    private readonly revenueTokenPointer: u16 = Blockchain.nextPointer;
    private readonly totalLockedPointer: u16 = Blockchain.nextPointer;
    private readonly rewardPerTokenPointer: u16 = Blockchain.nextPointer;
    private readonly totalRevenuePointer: u16 = Blockchain.nextPointer;

    // Per-beneficiary map pointers
    private readonly vestAmountPointer: u16 = Blockchain.nextPointer;
    private readonly vestStartPointer: u16 = Blockchain.nextPointer;
    private readonly vestCliffPointer: u16 = Blockchain.nextPointer;
    private readonly vestDurationPointer: u16 = Blockchain.nextPointer;
    private readonly releasedPointer: u16 = Blockchain.nextPointer;
    private readonly rewardDebtPointer: u16 = Blockchain.nextPointer;
    private readonly pendingRewardsPointer: u16 = Blockchain.nextPointer;

    // Persistent reentrancy lock (survives cross-contract re-entry)
    private readonly _locked: StoredBoolean = new StoredBoolean(this.lockedPointer, false);

    // Global stored values
    private readonly _owner: StoredAddress = new StoredAddress(this.ownerPointer);
    private readonly _vestingToken: StoredAddress = new StoredAddress(this.vestingTokenPointer);
    private readonly _revenueToken: StoredAddress = new StoredAddress(this.revenueTokenPointer);
    private readonly _totalLocked: StoredU256 = new StoredU256(
        this.totalLockedPointer,
        EMPTY_POINTER,
    );
    private readonly _rewardPerToken: StoredU256 = new StoredU256(
        this.rewardPerTokenPointer,
        EMPTY_POINTER,
    );
    private readonly _totalRevenue: StoredU256 = new StoredU256(
        this.totalRevenuePointer,
        EMPTY_POINTER,
    );

    // Per-beneficiary maps (address → u256)
    private readonly _vestAmount: AddressMemoryMap = new AddressMemoryMap(this.vestAmountPointer);
    private readonly _vestStart: AddressMemoryMap = new AddressMemoryMap(this.vestStartPointer);
    private readonly _vestCliff: AddressMemoryMap = new AddressMemoryMap(this.vestCliffPointer);
    private readonly _vestDuration: AddressMemoryMap = new AddressMemoryMap(
        this.vestDurationPointer,
    );
    private readonly _released: AddressMemoryMap = new AddressMemoryMap(this.releasedPointer);
    private readonly _rewardDebt: AddressMemoryMap = new AddressMemoryMap(this.rewardDebtPointer);
    private readonly _pendingRewards: AddressMemoryMap = new AddressMemoryMap(
        this.pendingRewardsPointer,
    );


    public constructor() {
        super();
    }

    /**
     * Deployment hook — runs ONCE when the contract is first deployed.
     *
     * NOTE: Known OPNet testnet bug — the node passes 0 bytes to onDeploy(),
     * so we CANNOT read constructor calldata here (BytesReader would throw).
     * Token addresses are set via the separate initialize() method below.
     */
    public override onDeployment(_calldata: Calldata): void {
        this._owner.value = Blockchain.tx.sender;
    }

    /**
     * One-time initializer — sets vestingToken and revenueToken after deployment.
     * Can only be called once and only by the contract owner.
     * Must be called before any other protocol interaction.
     */
    @method(
        { name: 'vestingToken', type: ABIDataTypes.ADDRESS },
        { name: 'revenueToken', type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public initialize(calldata: Calldata): BytesWriter {
        this.onlyOwner();

        if (!this._vestingToken.value.isZero()) {
            throw new Revert('VestingVault: already initialized');
        }

        const vestingToken: Address = calldata.readAddress();
        const revenueToken: Address = calldata.readAddress();

        if (vestingToken.isZero()) {
            throw new Revert('VestingVault: vestingToken is zero address');
        }
        if (revenueToken.isZero()) {
            throw new Revert('VestingVault: revenueToken is zero address');
        }

        this._vestingToken.value = vestingToken;
        this._revenueToken.value = revenueToken;

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ═══════════════════ STATE-CHANGING METHODS ═══════════════════════════════

    /**
     * Creates a vesting schedule for a beneficiary.
     * Owner must have approved this contract to spend `amount` of vestingToken.
     */
    @method(
        { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
        { name: 'cliffDuration', type: ABIDataTypes.UINT256 },
        { name: 'vestingDuration', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public addVesting(calldata: Calldata): BytesWriter {
        this.nonReentrant();
        this.onlyOwner();

        const beneficiary: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();
        const cliffDuration: u256 = calldata.readU256();
        const vestingDuration: u256 = calldata.readU256();

        // Validate inputs
        if (beneficiary.isZero()) {
            throw new Revert('VestingVault: beneficiary is zero address');
        }
        if (u256.eq(amount, u256.Zero)) {
            throw new Revert('VestingVault: amount is zero');
        }
        if (u256.eq(vestingDuration, u256.Zero)) {
            throw new Revert('VestingVault: vestingDuration is zero');
        }
        if (u256.gt(cliffDuration, vestingDuration)) {
            throw new Revert('VestingVault: cliff exceeds duration');
        }

        // Prevent double-vesting
        const existingAmount: u256 = this._vestAmount.get(beneficiary);
        if (u256.gt(existingAmount, u256.Zero)) {
            throw new Revert('VestingVault: beneficiary already has vesting');
        }

        // Update reward state before modifying locked balance
        this.updateReward(beneficiary);

        // Store vesting schedule
        const currentBlock: u256 = Blockchain.block.numberU256;
        this._vestAmount.set(beneficiary, amount);
        this._vestStart.set(beneficiary, currentBlock);
        this._vestCliff.set(beneficiary, cliffDuration);
        this._vestDuration.set(beneficiary, vestingDuration);
        this._released.set(beneficiary, u256.Zero);

        // Increase total locked balance
        const currentLocked: u256 = this._totalLocked.value;
        this._totalLocked.value = SafeMath.add(currentLocked, amount);

        // Set reward debt to current rewardPerToken (new user earns from now on)
        this._rewardDebt.set(beneficiary, this._rewardPerToken.value);

        // Pull tokens from owner into vault via transferFrom
        this.callTransferFrom(this._vestingToken.value, Blockchain.tx.sender, amount);

        this.emitEvent(new VestingAddedEvent(beneficiary, amount, cliffDuration, vestingDuration));
        this.releaseGuard();

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Releases vested tokens to the caller.
     * Checks-effects-interactions pattern enforced.
     */
    @method()
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public release(calldata: Calldata): BytesWriter {
        this.nonReentrant();

        const beneficiary: Address = Blockchain.tx.sender;
        const totalAmount: u256 = this._vestAmount.get(beneficiary);

        if (u256.eq(totalAmount, u256.Zero)) {
            throw new Revert('VestingVault: no vesting schedule');
        }

        // Snapshot revenue before changing locked balance
        this.updateReward(beneficiary);

        const releasable: u256 = this.computeReleasable(beneficiary);
        if (u256.eq(releasable, u256.Zero)) {
            throw new Revert('VestingVault: nothing to release');
        }

        // Effects: update state before external call
        const alreadyReleased: u256 = this._released.get(beneficiary);
        this._released.set(beneficiary, SafeMath.add(alreadyReleased, releasable));

        // Decrease total locked
        const currentLocked: u256 = this._totalLocked.value;
        this._totalLocked.value = SafeMath.sub(currentLocked, releasable);

        // Re-anchor reward debt after locked balance change
        this._rewardDebt.set(beneficiary, this._rewardPerToken.value);

        // Interaction: transfer vested tokens to beneficiary
        this.callTransfer(this._vestingToken.value, beneficiary, releasable);

        this.emitEvent(new TokensReleasedEvent(beneficiary, releasable));
        this.releaseGuard();

        const writer = new BytesWriter(32);
        writer.writeU256(releasable);
        return writer;
    }

    /**
     * Deposits revenue tokens for proportional distribution to all vested holders.
     * Composable: any address (owner or external contract) can call this.
     * Caller must have approved this contract to spend `amount` of revenueToken.
     */
    @method({ name: 'amount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public depositRevenue(calldata: Calldata): BytesWriter {
        this.nonReentrant();

        const amount: u256 = calldata.readU256();
        if (u256.eq(amount, u256.Zero)) {
            throw new Revert('VestingVault: revenue amount is zero');
        }

        const totalLocked: u256 = this._totalLocked.value;
        if (u256.eq(totalLocked, u256.Zero)) {
            throw new Revert('VestingVault: no locked tokens to distribute to');
        }

        // Accumulate reward per token: += (amount * PRECISION) / totalLocked
        const scaledAmount: u256 = SafeMath.mul(amount, VestingVault.PRECISION);
        const rewardIncrement: u256 = SafeMath.div(scaledAmount, totalLocked);
        const currentRpt: u256 = this._rewardPerToken.value;
        this._rewardPerToken.value = SafeMath.add(currentRpt, rewardIncrement);

        // Track total revenue deposited
        const currentTotal: u256 = this._totalRevenue.value;
        this._totalRevenue.value = SafeMath.add(currentTotal, amount);

        // Pull revenue tokens from depositor
        this.callTransferFrom(this._revenueToken.value, Blockchain.tx.sender, amount);

        this.emitEvent(new RevenueDepositedEvent(Blockchain.tx.sender, amount));
        this.releaseGuard();

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    /**
     * Claims accumulated revenue for the caller.
     * Checks-effects-interactions pattern enforced.
     */
    @method()
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public claimRevenue(calldata: Calldata): BytesWriter {
        this.nonReentrant();

        const beneficiary: Address = Blockchain.tx.sender;
        const totalAmount: u256 = this._vestAmount.get(beneficiary);

        if (u256.eq(totalAmount, u256.Zero)) {
            throw new Revert('VestingVault: no vesting schedule');
        }

        // Update accumulated revenue
        this.updateReward(beneficiary);

        const pending: u256 = this._pendingRewards.get(beneficiary);
        if (u256.eq(pending, u256.Zero)) {
            throw new Revert('VestingVault: no revenue to claim');
        }

        // Effects: zero out pending before transfer
        this._pendingRewards.set(beneficiary, u256.Zero);

        // Interaction: transfer revenue tokens to beneficiary
        this.callTransfer(this._revenueToken.value, beneficiary, pending);

        this.emitEvent(new RevenueClaimedEvent(beneficiary, pending));
        this.releaseGuard();

        const writer = new BytesWriter(32);
        writer.writeU256(pending);
        return writer;
    }

    // ═══════════════════ VIEW METHODS (read-only) ════════════════════════════

    /** Returns the amount of tokens currently releasable for a beneficiary. */
    @method({ name: 'beneficiary', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public releasableAmount(calldata: Calldata): BytesWriter {
        const beneficiary: Address = calldata.readAddress();
        const releasable: u256 = this.computeReleasable(beneficiary);

        const writer = new BytesWriter(32);
        writer.writeU256(releasable);
        return writer;
    }

    /** Returns the total amount of tokens that have vested so far for a beneficiary. */
    @method({ name: 'beneficiary', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public vestedBalance(calldata: Calldata): BytesWriter {
        const beneficiary: Address = calldata.readAddress();
        const vested: u256 = this.computeVested(beneficiary);

        const writer = new BytesWriter(32);
        writer.writeU256(vested);
        return writer;
    }

    /** Returns the pending revenue for a beneficiary (stored + uncollected). */
    @method({ name: 'beneficiary', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public pendingRevenue(calldata: Calldata): BytesWriter {
        const beneficiary: Address = calldata.readAddress();
        const pending: u256 = this.computePendingRevenue(beneficiary);

        const writer = new BytesWriter(32);
        writer.writeU256(pending);
        return writer;
    }

    /** Returns total revenue deposited into the vault since deployment. */
    @method()
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public totalRevenueDeposited(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._totalRevenue.value);
        return writer;
    }

    /** Returns full vesting info for a beneficiary in a single call. */
    @method({ name: 'beneficiary', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'totalAmount', type: ABIDataTypes.UINT256 },
        { name: 'startBlock', type: ABIDataTypes.UINT256 },
        { name: 'cliffDuration', type: ABIDataTypes.UINT256 },
        { name: 'vestingDuration', type: ABIDataTypes.UINT256 },
        { name: 'released', type: ABIDataTypes.UINT256 },
        { name: 'releasable', type: ABIDataTypes.UINT256 },
    )
    public getVestingInfo(calldata: Calldata): BytesWriter {
        const beneficiary: Address = calldata.readAddress();

        const totalAmount: u256 = this._vestAmount.get(beneficiary);
        const startBlock: u256 = this._vestStart.get(beneficiary);
        const cliffDuration: u256 = this._vestCliff.get(beneficiary);
        const vestDuration: u256 = this._vestDuration.get(beneficiary);
        const released: u256 = this._released.get(beneficiary);
        const releasable: u256 = this.computeReleasable(beneficiary);

        const writer = new BytesWriter(32 * 6);
        writer.writeU256(totalAmount);
        writer.writeU256(startBlock);
        writer.writeU256(cliffDuration);
        writer.writeU256(vestDuration);
        writer.writeU256(released);
        writer.writeU256(releasable);
        return writer;
    }

    /** Returns the contract owner address. */
    @method()
    @returns({ name: 'ownerAddress', type: ABIDataTypes.ADDRESS })
    public owner(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this._owner.value);
        return writer;
    }

    /** Returns the vesting token address. */
    @method()
    @returns({ name: 'token', type: ABIDataTypes.ADDRESS })
    public vestingToken(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this._vestingToken.value);
        return writer;
    }

    /** Returns the revenue token address. */
    @method()
    @returns({ name: 'token', type: ABIDataTypes.ADDRESS })
    public revenueToken(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeAddress(this._revenueToken.value);
        return writer;
    }

    /** Returns total tokens currently locked across all beneficiaries. */
    @method()
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public totalLocked(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this._totalLocked.value);
        return writer;
    }

    // ═══════════════════ INTERNAL HELPERS ═════════════════════════════════════

    private nonReentrant(): void {
        if (this._locked.value) {
            throw new Revert('VestingVault: reentrant call');
        }
        this._locked.value = true;
    }

    private releaseGuard(): void {
        this._locked.value = false;
    }

    private onlyOwner(): void {
        if (!Blockchain.tx.sender.equals(this._owner.value)) {
            throw new Revert('VestingVault: caller is not owner');
        }
    }

    /**
     * Updates pending revenue for a beneficiary. Must be called before any
     * locked balance change. Uses the Synthetix reward-per-token accumulator.
     */
    private updateReward(beneficiary: Address): void {
        const lockedBalance: u256 = this.getLockedBalance(beneficiary);
        if (u256.eq(lockedBalance, u256.Zero)) {
            this._rewardDebt.set(beneficiary, this._rewardPerToken.value);
            return;
        }

        const currentRpt: u256 = this._rewardPerToken.value;
        const userDebt: u256 = this._rewardDebt.get(beneficiary);

        // earned = lockedBalance * (currentRpt - userDebt) / PRECISION
        const rewardDelta: u256 = SafeMath.sub(currentRpt, userDebt);
        const earned: u256 = SafeMath.div(
            SafeMath.mul(lockedBalance, rewardDelta),
            VestingVault.PRECISION,
        );

        const currentPending: u256 = this._pendingRewards.get(beneficiary);
        this._pendingRewards.set(beneficiary, SafeMath.add(currentPending, earned));
        this._rewardDebt.set(beneficiary, currentRpt);
    }

    /** Locked balance = totalVestingAmount - released */
    private getLockedBalance(beneficiary: Address): u256 {
        const totalAmount: u256 = this._vestAmount.get(beneficiary);
        const released: u256 = this._released.get(beneficiary);

        if (u256.eq(totalAmount, u256.Zero)) {
            return u256.Zero;
        }

        return SafeMath.sub(totalAmount, released);
    }

    /**
     * Computes total vested tokens using linear vesting with cliff.
     * Uses block height (tamper-proof, unlike medianTimestamp).
     */
    private computeVested(beneficiary: Address): u256 {
        const totalAmount: u256 = this._vestAmount.get(beneficiary);
        if (u256.eq(totalAmount, u256.Zero)) {
            return u256.Zero;
        }

        const startBlock: u256 = this._vestStart.get(beneficiary);
        const cliffDuration: u256 = this._vestCliff.get(beneficiary);
        const vestDuration: u256 = this._vestDuration.get(beneficiary);
        const currentBlock: u256 = Blockchain.block.numberU256;

        // Before cliff: nothing vested
        const cliffEnd: u256 = SafeMath.add(startBlock, cliffDuration);
        if (u256.lt(currentBlock, cliffEnd)) {
            return u256.Zero;
        }

        // After full duration: everything vested
        const vestEnd: u256 = SafeMath.add(startBlock, vestDuration);
        if (currentBlock >= vestEnd) {
            return totalAmount;
        }

        // Linear: totalAmount * elapsed / vestingDuration
        const elapsed: u256 = SafeMath.sub(currentBlock, startBlock);
        return SafeMath.div(SafeMath.mul(totalAmount, elapsed), vestDuration);
    }

    /** Releasable = vested - alreadyReleased */
    private computeReleasable(beneficiary: Address): u256 {
        const vested: u256 = this.computeVested(beneficiary);
        const released: u256 = this._released.get(beneficiary);

        if (vested <= released) {
            return u256.Zero;
        }

        return SafeMath.sub(vested, released);
    }

    /** Computes total pending revenue (stored + uncollected) — pure view. */
    private computePendingRevenue(beneficiary: Address): u256 {
        const lockedBalance: u256 = this.getLockedBalance(beneficiary);
        const storedPending: u256 = this._pendingRewards.get(beneficiary);

        if (u256.eq(lockedBalance, u256.Zero)) {
            return storedPending;
        }

        const currentRpt: u256 = this._rewardPerToken.value;
        const userDebt: u256 = this._rewardDebt.get(beneficiary);
        const rewardDelta: u256 = SafeMath.sub(currentRpt, userDebt);
        const earned: u256 = SafeMath.div(
            SafeMath.mul(lockedBalance, rewardDelta),
            VestingVault.PRECISION,
        );

        return SafeMath.add(storedPending, earned);
    }

    /** Calls OP20 transfer(to, amount) via cross-contract call. */
    private callTransfer(token: Address, to: Address, amount: u256): void {
        const writer = new BytesWriter(4 + 32 + 32);
        writer.writeSelector(VestingVault.TRANSFER_SELECTOR);
        writer.writeAddress(to);
        writer.writeU256(amount);

        const result: CallResult = Blockchain.call(token, writer, true);
        if (result.data.byteLength > 0) {
            if (!result.data.readBoolean()) {
                throw new Revert('VestingVault: token transfer failed');
            }
        }
    }

    /** Calls OP20 transferFrom(from, vault, amount) via cross-contract call. */
    private callTransferFrom(token: Address, from: Address, amount: u256): void {
        const writer = new BytesWriter(4 + 32 + 32 + 32);
        writer.writeSelector(VestingVault.TRANSFER_FROM_SELECTOR);
        writer.writeAddress(from);
        writer.writeAddress(Blockchain.contract.address);
        writer.writeU256(amount);

        const result: CallResult = Blockchain.call(token, writer, true);
        if (result.data.byteLength > 0) {
            if (!result.data.readBoolean()) {
                throw new Revert('VestingVault: token transferFrom failed');
            }
        }
    }
}
