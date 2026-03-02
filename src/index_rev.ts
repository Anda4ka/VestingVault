import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { RevenueToken } from './RevenueToken';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

// 1. Factory function — REQUIRED
Blockchain.contract = (): RevenueToken => {
    return new RevenueToken();
};

// 2. Runtime exports — REQUIRED
export * from '@btc-vision/btc-runtime/runtime/exports/index';

// 3. Abort handler — REQUIRED
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
