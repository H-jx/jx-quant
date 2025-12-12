/**
 * hquant-core: 高性能量化交易指标计算库
 *
 * Rust 核心 + Node.js N-API 绑定
 */

export interface Kline {
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  timestamp: number;
  buy?: number;
  sell?: number;
}

export interface BollResult {
  up: number;
  mid: number;
  low: number;
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
}

/**
 * HQuant 量化指标计算引擎
 */
export class HQuant {
  /**
   * 创建 HQuant 实例
   * @param capacity K线历史容量
   */
  constructor(capacity: number);

  // ========== 添加指标 ==========

  /**
   * 添加移动平均线指标
   * @param name 指标名称
   * @param period 周期
   * @param maxHistory 结果历史长度 (默认 120)
   */
  addMA(name: string, period: number, maxHistory?: number): void;

  /**
   * 添加布林带指标
   * @param name 指标名称
   * @param period 周期 (通常 20)
   * @param stdFactor 标准差倍数 (通常 2)
   * @param maxHistory 结果历史长度
   */
  addBOLL(name: string, period: number, stdFactor: number, maxHistory?: number): void;

  /**
   * 添加 RSI 指标
   * @param name 指标名称
   * @param period 周期 (通常 14)
   * @param maxHistory 结果历史长度
   */
  addRSI(name: string, period: number, maxHistory?: number): void;

  /**
   * 添加 MACD 指标
   * @param name 指标名称
   * @param shortPeriod 短期 EMA 周期 (通常 12)
   * @param longPeriod 长期 EMA 周期 (通常 26)
   * @param signalPeriod 信号线周期 (通常 9)
   * @param maxHistory 结果历史长度
   */
  addMACD(
    name: string,
    shortPeriod: number,
    longPeriod: number,
    signalPeriod: number,
    maxHistory?: number
  ): void;

  /**
   * 添加 ATR 指标
   * @param name 指标名称
   * @param period 周期 (通常 14)
   * @param maxHistory 结果历史长度
   */
  addATR(name: string, period: number, maxHistory?: number): void;

  /**
   * 添加 VRI 指标
   * @param name 指标名称
   * @param period 周期
   * @param maxHistory 结果历史长度
   */
  addVRI(name: string, period: number, maxHistory?: number): void;

  // ========== 数据操作 ==========

  /**
   * 添加一根K线
   */
  addKline(kline: Kline): void;

  /**
   * 更新最后一根K线 (不增加)
   */
  updateLast(kline: Kline): void;

  /**
   * 从 JSON 批量导入
   * @param json JSON 字符串
   */
  importJson(json: string): void;

  /**
   * 从二进制批量导入 (最快)
   * @param buffer 二进制数据
   */
  importBinary(buffer: Buffer): void;

  // ========== 获取指标 ==========

  /**
   * 获取 MA 值
   * @param name 指标名称
   * @param index 索引 (-1 = 最新, 0 = 最旧)
   */
  getMA(name: string, index?: number): number;

  /**
   * 获取 BOLL 值
   * @param name 指标名称
   * @param index 索引
   */
  getBOLL(name: string, index?: number): BollResult;

  /**
   * 获取 RSI 值
   * @param name 指标名称
   * @param index 索引
   */
  getRSI(name: string, index?: number): number;

  /**
   * 获取 MACD 值
   * @param name 指标名称
   * @param index 索引
   */
  getMACD(name: string, index?: number): MacdResult;

  /**
   * 获取 ATR 值
   * @param name 指标名称
   * @param index 索引
   */
  getATR(name: string, index?: number): number;

  /**
   * 获取 VRI 值
   * @param name 指标名称
   * @param index 索引
   */
  getVRI(name: string, index?: number): number;

  // ========== 工具方法 ==========

  /**
   * 获取 K 线数量
   */
  klineCount(): number;

  /**
   * 获取指标历史长度
   */
  indicatorLen(name: string): number;

  /**
   * 导出为二进制格式
   */
  exportBinary(): Buffer;
}
