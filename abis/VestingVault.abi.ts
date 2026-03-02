import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const VestingVaultEvents = [];

export const VestingVaultAbi = [
    {
        name: 'addVesting',
        inputs: [
            { name: 'beneficiary', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
            { name: 'cliffDuration', type: ABIDataTypes.UINT256 },
            { name: 'vestingDuration', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'release',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'depositRevenue',
        inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claimRevenue',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'releasableAmount',
        inputs: [{ name: 'beneficiary', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'vestedBalance',
        inputs: [{ name: 'beneficiary', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'pendingRevenue',
        inputs: [{ name: 'beneficiary', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'totalRevenueDeposited',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getVestingInfo',
        inputs: [{ name: 'beneficiary', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'totalAmount', type: ABIDataTypes.UINT256 },
            { name: 'startBlock', type: ABIDataTypes.UINT256 },
            { name: 'cliffDuration', type: ABIDataTypes.UINT256 },
            { name: 'vestingDuration', type: ABIDataTypes.UINT256 },
            { name: 'released', type: ABIDataTypes.UINT256 },
            { name: 'releasable', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'owner',
        inputs: [],
        outputs: [{ name: 'ownerAddress', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'vestingToken',
        inputs: [],
        outputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'revenueToken',
        inputs: [],
        outputs: [{ name: 'token', type: ABIDataTypes.ADDRESS }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'totalLocked',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...VestingVaultEvents,
    ...OP_NET_ABI,
];

export default VestingVaultAbi;
