/**
 * RevenueToken — Simple mintable OP20 test token
 * Used as the "revenue token" for VestingVault testing on OPNet testnet.
 *
 * NOTE: onDeployment() reads NO calldata — avoids OPNet testnet 0-byte buffer bug.
 *       Token parameters are hardcoded. Deployer can mint tokens after deployment.
 */
import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    OP20,
    OP20InitParameters,
    Blockchain,
    Address,
    Calldata,
    BytesWriter,
    Revert,
} from '@btc-vision/btc-runtime/runtime';

@final
export class RevenueToken extends OP20 {
    public constructor() {
        super();
    }

    /**
     * Initialize token on deployment — NO calldata reading (testnet 0-byte bug workaround).
     */
    public override onDeployment(_calldata: Calldata): void {
        // 1 billion tokens with 18 decimals
        const maxSupply = u256.fromString('1000000000000000000000000000');
        this.instantiate(new OP20InitParameters(maxSupply, 18, 'Revenue Token', 'REV'));
    }

    /**
     * Mint tokens to any address. Only callable by the deployer.
     */
    @method(
        { name: 'to', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public mint(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const to: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();

        if (to.equals(Address.zero())) {
            throw new Revert('RevenueToken: mint to zero address');
        }
        if (amount.isZero()) {
            throw new Revert('RevenueToken: mint amount is zero');
        }

        this._mint(to, amount);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }
}
