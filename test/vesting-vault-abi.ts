/**
 * VestingVault ABI definition for use with the `opnet` npm package.
 * Matches the auto-generated abis/VestingVault.abi.json.
 */
import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi } from 'opnet';

export const VESTING_VAULT_ABI: BitcoinInterfaceAbi = [
    // ═══════════ STATE-CHANGING METHODS ═══════════
    {
        name: 'initialize',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'vestingToken', type: ABIDataTypes.ADDRESS },
            { name: 'revenueToken', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'addVesting',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'cliffDuration', type: ABIDataTypes.UINT256 },
            { name: 'vestingDuration', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'release',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'depositRevenue',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'claimRevenue',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    },

    // ═══════════ VIEW METHODS ═══════════
    {
        name: 'releasableAmount',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'beneficiary', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'vestedBalance',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'beneficiary', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'pendingRevenue',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'beneficiary', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'totalRevenueDeposited',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'getVestingInfo',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'beneficiary', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'cliffDuration', type: ABIDataTypes.UINT256 },
            { name: 'vestingDuration', type: ABIDataTypes.UINT256 },
            { name: 'released', type: ABIDataTypes.UINT256 },
            { name: 'releasable', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'owner',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'ownerAddress', type: ABIDataTypes.ADDRESS }],
    },
    {
        name: 'vestingToken',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
    },
    {
        name: 'revenueToken',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
    },
    {
        name: 'totalLocked',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    },
];
