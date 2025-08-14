type PositionSide = 'LONG' | 'SHORT' | 'BOTH';
declare type OrderSide = 'BUY' | 'SELL';
declare type numberInString = string | number;
interface KlineIn {
    open: number | string;
    close: number | string;
    low: number | string;
    high: number | string;
    volume: number | string;
    sell?: number | string;
    buy?: number | string;
    timestamp: number;
}
interface Kline {
    open: number;
    close: number;
    low: number;
    high: number;
    volume: number;
    sell?: number;
    buy?: number;
    timestamp: number;
}
interface Indicator<T extends (Kline | number) = Kline> {
    maxHistoryLength: number;
    /** 添加指标时会注入 */
    _quant?: any;
    /** 添加单个数据计算指标 */
    add(data: T): void;
    /** 更新并替换最后一个指标， 不增加数据 */
    updateLast(data: T): void;
    /**
     * 获取指标值
     * @index -1 代表获取倒数第一个值
     */
    getValue(index?: number): number | Record<string, number | number[]>;
}
type Signal = 'BUY' | 'SELL' | null | undefined;
type Strategy<T extends Kline> = (indicators: Map<string, Indicator>, bar: T) => Signal;

export type { Indicator, Kline, KlineIn, OrderSide, PositionSide, Signal, Strategy, numberInString };
