import type { Quant } from "./Quant";
export type { CircularQueue } from "./common/CircularQueue";

export type AutoTradeType = "spot" | "futures" | "delivery"
export type PositionSide = 'LONG' | 'SHORT' | 'BOTH';
export declare type OrderSide = 'BUY' | 'SELL';
export declare type numberInString = string | number;

export interface KlineIn {
  open: number | string;
  close: number | string;
  low: number | string;
  high: number | string;
  volume: number | string;
  sell?: number | string;
  buy?: number | string;
  timestamp: number;
}

export interface Kline {
  open: number;
  close: number;
  low: number;
  high: number;
  volume: number;
  sell?: number;
  buy?: number;
  timestamp: number;
}
export interface Indicator<T extends (Kline | number) = Kline> {
  maxHistoryLength: number;
  /** 添加指标时会注入 */
  _quant?: Quant<Kline>;
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

export type Signal = 'BUY' | 'SELL' | null | undefined; // 交易信号

export type Strategy<T extends Kline> = (indicators: Map<string, Indicator>, bar: T) => Signal; // 交易策略

export interface FuturesPosition {
  // 开仓均价
  entryPrice: numberInString;
  leverage: numberInString;
  // 参考强平价格
  liquidationPrice?: numberInString;
  // 当前标记价格
  markPrice: numberInString;
  // 头寸数量，符号代表多空方向, 正数为多，负数为空
  positionAmt: numberInString;
  positionSide: PositionSide;
  symbol: string;
  // 仓位面值
  notional?: numberInString;
  // 持仓未实现盈亏
  unRealizedProfit?: numberInString;
  autoTradeType: AutoTradeType
}

export interface FuturesBalance {
  asset: string;
  // 余额
  balance: numberInString;
  // 全仓余额
  // crossWalletBalance?: numberInString;
  // 全仓持仓未实现盈亏
  crossUnPnl: numberInString;
  // 下单可用余额
  availableBalance: numberInString;
}