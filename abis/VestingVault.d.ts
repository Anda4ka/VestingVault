import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the addVesting function call.
 */
export type AddVesting = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the release function call.
 */
export type Release = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the depositRevenue function call.
 */
export type DepositRevenue = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the claimRevenue function call.
 */
export type ClaimRevenue = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the releasableAmount function call.
 */
export type ReleasableAmount = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the vestedBalance function call.
 */
export type VestedBalance = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the pendingRevenue function call.
 */
export type PendingRevenue = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the totalRevenueDeposited function call.
 */
export type TotalRevenueDeposited = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getVestingInfo function call.
 */
export type GetVestingInfo = CallResult<
    {
        totalAmount: bigint;
        startBlock: bigint;
        cliffDuration: bigint;
        vestingDuration: bigint;
        released: bigint;
        releasable: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the owner function call.
 */
export type Owner = CallResult<
    {
        ownerAddress: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the vestingToken function call.
 */
export type VestingToken = CallResult<
    {
        token: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the revenueToken function call.
 */
export type RevenueToken = CallResult<
    {
        token: Address;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the totalLocked function call.
 */
export type TotalLocked = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IVestingVault
// ------------------------------------------------------------------
export interface IVestingVault extends IOP_NETContract {
    addVesting(
        beneficiary: Address,
        amount: bigint,
        cliffDuration: bigint,
        vestingDuration: bigint,
    ): Promise<AddVesting>;
    release(): Promise<Release>;
    depositRevenue(amount: bigint): Promise<DepositRevenue>;
    claimRevenue(): Promise<ClaimRevenue>;
    releasableAmount(beneficiary: Address): Promise<ReleasableAmount>;
    vestedBalance(beneficiary: Address): Promise<VestedBalance>;
    pendingRevenue(beneficiary: Address): Promise<PendingRevenue>;
    totalRevenueDeposited(): Promise<TotalRevenueDeposited>;
    getVestingInfo(beneficiary: Address): Promise<GetVestingInfo>;
    owner(): Promise<Owner>;
    vestingToken(): Promise<VestingToken>;
    revenueToken(): Promise<RevenueToken>;
    totalLocked(): Promise<TotalLocked>;
}
