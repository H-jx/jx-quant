import { RestClient } from 'okx-api'
import type {
  Exchange,
  TradeType,
  Result,
  SymbolInfo,
  Ticker,
  OrderBook,
  AdapterOptions
} from '../types'
import { Ok, Err, SymbolStatus } from '../types'
import { BasePublicAdapter } from '../BasePublicAdapter'
import {
  unifiedToOkx,
  okxToUnified,
  getOkxInstType,
  getDecimalPlaces,
  wrapAsync,
  createProxyAgent
} from '../utils'

// OKX API response types
interface OkxInstrumentResponse {
  instId: string
  baseCcy: string
  quoteCcy: string
  tickSz: string
  lotSz: string
  minSz: string
  maxLmtSz: string
  state: string
  ctVal?: string
  lever?: string
}

interface OkxTickerResponse {
  instId: string
  last: string
  high24h: string
  low24h: string
  vol24h: string
  volCcy24h: string
  ts: string
}

interface OkxOrderBookResponse {
  asks: [string, string, string, string][]
  bids: [string, string, string, string][]
  ts: string
}

interface OkxMarkPriceResponse {
  markPx: string
}

/**
 * OKX 公共 API 适配器
 */
export class OkxPublicAdapter extends BasePublicAdapter {
  readonly exchange: Exchange = 'okx'

  protected client: RestClient

  constructor(options?: AdapterOptions) {
    super()
    // 公共 API 不需要认证，但 okx-api 在设置 httpsAgent 时需要提供空的认证信息
    const agent = createProxyAgent(options)
    if (agent) {
      // 当有代理时，需要提供空的 API 配置以避免 okx-api 的校验
      this.client = new RestClient({
        apiKey: '',
        apiSecret: '',
        apiPass: ''
      }, undefined)
    } else {
      this.client = new RestClient()
    }
  }

  /**
   * 获取交易对信息
   */
  async getSymbolInfo(symbol: string, tradeType: TradeType): Promise<Result<SymbolInfo>> {
    // 先检查缓存
    const cached = this.getCachedSymbol(symbol, tradeType)
    if (cached) {
      return Ok(cached)
    }

    const instId = unifiedToOkx(symbol, tradeType)
    const instType = getOkxInstType(tradeType)

    const result = await wrapAsync<OkxInstrumentResponse[]>(
      () => this.client.getInstruments({ instType, instId }),
      'GET_SYMBOL_INFO_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (!data || data.length === 0) {
      return Err({
        code: 'SYMBOL_NOT_FOUND',
        message: `Symbol ${symbol} not found`
      })
    }

    const inst = data[0]
    const symbolInfo = this.transformSymbolInfo(inst, tradeType)

    // 设置缓存
    this.setCachedSymbol(symbol, tradeType, symbolInfo)

    return Ok(symbolInfo)
  }

  /**
   * 获取所有交易对信息
   */
  async getAllSymbols(tradeType: TradeType): Promise<Result<SymbolInfo[]>> {
    const instType = getOkxInstType(tradeType)

    const result = await wrapAsync<OkxInstrumentResponse[]>(
      () => this.client.getInstruments({ instType }),
      'GET_ALL_SYMBOLS_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const symbols = result.data.map(inst => this.transformSymbolInfo(inst, tradeType))

    // 批量设置缓存
    this.setCachedSymbols(tradeType, symbols)

    return Ok(symbols)
  }

  /**
   * 获取当前价格
   */
  async getPrice(symbol: string, tradeType: TradeType): Promise<Result<string>> {
    const instId = unifiedToOkx(symbol, tradeType)

    const result = await wrapAsync<OkxTickerResponse[]>(
      () => this.client.getTicker({ instId }),
      'GET_PRICE_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (!data || data.length === 0) {
      return Err({
        code: 'PRICE_NOT_FOUND',
        message: `Price for ${symbol} not found`
      })
    }

    return Ok(data[0].last)
  }

  /**
   * 获取 Ticker
   */
  async getTicker(symbol: string, tradeType: TradeType): Promise<Result<Ticker>> {
    const instId = unifiedToOkx(symbol, tradeType)

    const result = await wrapAsync<OkxTickerResponse[]>(
      () => this.client.getTicker({ instId }),
      'GET_TICKER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (!data || data.length === 0) {
      return Err({
        code: 'TICKER_NOT_FOUND',
        message: `Ticker for ${symbol} not found`
      })
    }

    const ticker = data[0]
    // OKX 不直接返回涨跌幅，需要从其他接口获取或计算
    // 这里暂时返回 0
    return Ok({
      symbol,
      lastPrice: ticker.last,
      highPrice: ticker.high24h,
      lowPrice: ticker.low24h,
      volume: ticker.vol24h,
      quoteVolume: ticker.volCcy24h,
      priceChangePercent: '0',
      timestamp: parseInt(ticker.ts)
    })
  }

  /**
   * 获取深度数据
   */
  async getOrderBook(
    symbol: string,
    tradeType: TradeType,
    limit: number = 20
  ): Promise<Result<OrderBook>> {
    const instId = unifiedToOkx(symbol, tradeType)

    const result = await wrapAsync<OkxOrderBookResponse[]>(
      () => this.client.getOrderBook({ instId, sz: String(limit) }),
      'GET_ORDERBOOK_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (!data || data.length === 0) {
      return Err({
        code: 'ORDERBOOK_NOT_FOUND',
        message: `OrderBook for ${symbol} not found`
      })
    }

    const orderBook = data[0]
    return Ok({
      symbol,
      asks: orderBook.asks.map(([price, qty]) => [price, qty] as [string, string]),
      bids: orderBook.bids.map(([price, qty]) => [price, qty] as [string, string]),
      timestamp: parseInt(orderBook.ts)
    })
  }

  /**
   * 获取标记价格 (合约)
   */
  async getMarkPrice(symbol: string, tradeType: TradeType): Promise<Result<string>> {
    if (tradeType === 'spot') {
      // 现货没有标记价格，返回最新价
      return this.getPrice(symbol, tradeType)
    }

    const instId = unifiedToOkx(symbol, tradeType)

    const result = await wrapAsync<OkxMarkPriceResponse[]>(
      () => this.client.getMarkPrice({ instId }),
      'GET_MARK_PRICE_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (!data || data.length === 0) {
      return Err({
        code: 'MARK_PRICE_NOT_FOUND',
        message: `Mark price for ${symbol} not found`
      })
    }

    return Ok(data[0].markPx)
  }

  /**
   * 统一格式 -> OKX 原始格式
   */
  toRawSymbol(symbol: string, tradeType: TradeType): string {
    return unifiedToOkx(symbol, tradeType)
  }

  /**
   * OKX 原始格式 -> 统一格式
   */
  fromRawSymbol(rawSymbol: string, _tradeType: TradeType): string {
    const { symbol } = okxToUnified(rawSymbol)
    return symbol
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 转换 OKX 的 instrument 数据为统一格式
   */
  private transformSymbolInfo(
    inst: OkxInstrumentResponse,
    tradeType: TradeType
  ): SymbolInfo {
    // 从 instId 解析出统一 symbol
    // BTC-USDT -> BTC-USDT
    // BTC-USDT-SWAP -> BTC-USDT
    const parts = inst.instId.split('-')
    const unifiedSymbol = `${parts[0]}-${parts[1]}`

    return {
      symbol: unifiedSymbol,
      rawSymbol: inst.instId,
      baseCurrency: inst.baseCcy || parts[0],
      quoteCurrency: inst.quoteCcy || parts[1],
      tradeType,
      tickSize: inst.tickSz,
      stepSize: inst.lotSz,
      minQty: inst.minSz,
      maxQty: inst.maxLmtSz,
      quantityPrecision: getDecimalPlaces(inst.lotSz),
      pricePrecision: getDecimalPlaces(inst.tickSz),
      status: inst.state === 'live' ? SymbolStatus.Enabled : SymbolStatus.Disabled,
      contractValue: Number(inst.ctVal) || 0,
      maxLeverage: inst.lever ? parseInt(inst.lever) : 0
    }
  }
}
