import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const RevenueTokenEvents = [];

export const RevenueTokenAbi = [
    {
        name: 'mint',
        inputs: [
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    ...RevenueTokenEvents,
    ...OP_NET_ABI,
];

export default RevenueTokenAbi;
