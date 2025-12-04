/**
 * h-trader-adapter
 * 多平台交易适配器 - 抹平OKX/Binance等交易所的API差异
 */

// 类型导出
export * from './types';

// 基类
export { BasePublicAdapter } from './BasePublicAdapter';
export { BaseTradeAdapter } from './BaseTradeAdapter';

// 适配器实现
export {
  OkxPublicAdapter,
  OkxTradeAdapter,
  BinancePublicAdapter,
  BinanceTradeAdapter,
} from './adapters';

// 工具函数
export * from './utils';

// 工厂函数
import type {
  PublicAdapterConfig,
  TradeAdapterConfig,
  IPublicAdapter,
  ITradeAdapter,
} from './types';
import { OkxPublicAdapter } from './adapters/OkxPublicAdapter';
import { OkxTradeAdapter } from './adapters/OkxTradeAdapter';
import { BinancePublicAdapter } from './adapters/BinancePublicAdapter';
import { BinanceTradeAdapter } from './adapters/BinanceTradeAdapter';

export type ExchangeName = 'okx' | 'binance';

/**
 * 创建公共适配器（无需认证）
 * @param exchange 交易所名称
 * @param config 配置（可选）
 */
export function createPublicAdapter(
  exchange: ExchangeName,
  config: PublicAdapterConfig = {}
): IPublicAdapter {
  switch (exchange) {
    case 'okx':
      return new OkxPublicAdapter(config);
    case 'binance':
      return new BinancePublicAdapter(config);
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}

/**
 * 创建交易适配器（需要认证）
 * @param exchange 交易所名称
 * @param config 配置（需要 apiKey/apiSecret）
 * @param publicAdapter 可选的公共适配器实例（用于共享）
 */
export function createTradeAdapter(
  exchange: ExchangeName,
  config: TradeAdapterConfig,
  publicAdapter?: IPublicAdapter
): ITradeAdapter {
  switch (exchange) {
    case 'okx':
      return new OkxTradeAdapter(config, publicAdapter);
    case 'binance':
      return new BinanceTradeAdapter(config, publicAdapter);
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}

// 兼容旧 API
export { createTradeAdapter as createAdapter };
