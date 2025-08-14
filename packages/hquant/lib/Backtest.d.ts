import { Signal, Kline } from './interface.js';

interface Options {
    balance: number;
    volume: number;
    tradeVolume?: number | ((price: number) => number);
}
interface Trade {
    timestamp?: number;
    time?: string;
    price: number;
    volume: number;
    action: Signal;
    profit?: number;
}
interface BacktestResult {
    maxDrawdownRate: number;
    profit: number;
}
interface Data extends Pick<Kline, 'close' | 'timestamp'> {
    action: Signal;
    volume?: number;
}
declare class Backtest {
    /**
    * 交易费率
    */
    private transactFeeRate;
    private tradeVolume;
    private trades;
    private currentData;
    private initData;
    constructor(options: Options);
    reset(): void;
    mockTrade(data: Data & {
        tradeVolume?: number;
    }): void;
    run(data: Data[]): BacktestResult;
    /** 获取收益*/
    getProfit(): number[];
    getResult(): {
        maxDrawdownRate: number;
        profit: number;
        profitRate: number;
        buyCount: number;
        sellCount: number;
    };
    getTrades(): Trade[];
    destroy(): void;
}

export { Backtest, type BacktestResult, type Data, type Trade };
