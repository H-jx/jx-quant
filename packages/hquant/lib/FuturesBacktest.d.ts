import { numberInString, PositionSide, OrderSide } from './interface.js';

interface BacktestParams {
    accountValue: number;
    /** 合约倍数 */
    leverage?: number;
    makerFee?: number;
    takerFee?: number;
}
interface FuturesBalance {
    asset: string;
    balance: numberInString;
    crossUnPnl: numberInString;
    availableBalance: numberInString;
}
interface FuturesPosition {
    entryPrice: numberInString;
    leverage?: numberInString;
    /**
     *  初始保证金
     */
    initialMargin?: numberInString;
    liquidationPrice?: numberInString;
    markPrice: numberInString;
    positionAmt: numberInString;
    positionSide: PositionSide;
    symbol: string;
    notional?: numberInString;
    unRealizedProfit?: numberInString;
}
interface Trade {
    time: number;
    price: number;
    volume?: number;
    side?: OrderSide;
    positionSide?: PositionSide;
    text?: string;
}
interface Position extends Omit<FuturesPosition, 'symbol' | 'autoTradeType'> {
    entryPrice: number;
    exitPrice?: number;
    positionAmt: number;
    side: OrderSide;
    text?: string;
}
interface FuturesBacktestResult {
    currentAsset: number;
    profit: number;
    profitRate: number;
    maxDrawdownRate: number;
    buyCount: number;
    sellCount: number;
}
declare function getDirection(position: Omit<FuturesPosition, 'symbol' | 'autoTradeType'>): 1 | -1;
declare function getProfitByPosition(position: Omit<FuturesPosition, 'symbol' | 'autoTradeType'>): number;
declare class FuturesBacktest {
    private usdtBalance;
    /** 合约倍数 */
    private leverage;
    private makerFee;
    private takerFee;
    private maxDrawdownRate;
    private maxAssetValue;
    private initialAssetValue;
    private trades;
    private buyCount;
    private sellCount;
    positions: Position[];
    maintMarginPercent: number;
    liquidationPrice: number;
    constructor(params: BacktestParams);
    reset(): void;
    updateLiquidationPrice(): number;
    getInitialAccountValue(): number;
    /**
     * 获取未实现盈亏
     */
    getCrossUnPnl(): number;
    /** 计算保證金 */
    private calculateMargin;
    /** 计算订单名义价值 */
    private calculateNotional;
    updateBalance(): void;
    getPosition(positionSide: 'LONG' | 'SHORT'): Position | undefined;
    mockTrade(trade: Trade): void;
    getAccountInfo(): FuturesBalance;
    getResult(): FuturesBacktestResult;
    getTrades(): Position[];
    /** 开单 */
    private openPosition;
    /** 平单 */
    private closePosition;
    destroy(): void;
}

export { FuturesBacktest, type FuturesBalance, type FuturesPosition, type Trade, getDirection, getProfitByPosition };
