import { MainClient, USDMClient, CoinMClient, numberInString } from 'binance'
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
  unifiedToBinance,
  binanceToUnified,
  getDecimalPlaces,
  wrapAsync,
  createProxyAgent
} from '../utils'

// Binance API response types
interface BinancePriceResponse {
  price: numberInString
}

interface BinanceTickerResponse {
  symbol: string
  lastPrice: numberInString
  highPrice: numberInString
  lowPrice: numberInString
  volume: numberInString
  quoteVolume: numberInString
  priceChangePercent: numberInString
  closeTime: number
}

interface BinanceOrderBookResponse {
  bids: [numberInString, numberInString][]
  asks: [numberInString, numberInString][]
}

interface BinanceMarkPriceResponse {
  markPrice: numberInString
}

interface BinanceSymbolFilter {
  filterType: string
  tickSize?: numberInString
  stepSize?: numberInString
  minQty?: numberInString
  maxQty?: numberInString
}

interface BinanceSpotSymbol {
  symbol: string
  baseAsset: string
  quoteAsset: string
  status: string
  filters: BinanceSymbolFilter[]
}

interface BinanceFuturesSymbol {
  symbol: string
  baseAsset: string
  quoteAsset: string
  status: string
  quantityPrecision: number
  pricePrecision: number
  filters: BinanceSymbolFilter[]
}

interface BinanceDeliverySymbol {
  symbol: string
  pair: string
  baseAsset: string
  quoteAsset: string
  status: string
  quantityPrecision: number
  pricePrecision: number
  contractSize?: number
  filters: BinanceSymbolFilter[]
}

/**
 * Binance 公共 API 适配器
 */
export class BinancePublicAdapter extends BasePublicAdapter {
  readonly exchange: Exchange = 'binance'

  protected spotClient: MainClient
  protected futuresClient: USDMClient
  protected deliveryClient: CoinMClient

  constructor(options?: AdapterOptions) {
    super()
    // 公共 API 不需要认证
    const clientOptions: Record<string, unknown> = {}
    const agent = createProxyAgent(options)
    if (agent) {
      clientOptions.httpsAgent = agent
    }
    this.spotClient = new MainClient(clientOptions)
    this.futuresClient = new USDMClient(clientOptions)
    this.deliveryClient = new CoinMClient(clientOptions)
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

    // 获取所有交易对信息后筛选
    const allResult = await this.getAllSymbols(tradeType)
    if (!allResult.ok) {
      return Err(allResult.error)
    }

    const info = allResult.data.find(s => s.symbol === symbol)
    if (!info) {
      return Err({
        code: 'SYMBOL_NOT_FOUND',
        message: `Symbol ${symbol} not found`
      })
    }

    return Ok(info)
  }

  /**
   * 获取所有交易对信息
   */
  async getAllSymbols(tradeType: TradeType): Promise<Result<SymbolInfo[]>> {
    switch (tradeType) {
      case 'spot':
        return this.getSpotSymbols()
      case 'futures':
        return this.getFuturesSymbols()
      case 'delivery':
        return this.getDeliverySymbols()
    }
  }

  /**
   * 获取当前价格
   */
  async getPrice(symbol: string, tradeType: TradeType): Promise<Result<string>> {
    const rawSymbol = unifiedToBinance(symbol, tradeType)

    const result = await wrapAsync<BinancePriceResponse | BinancePriceResponse[]>(
      () => {
        switch (tradeType) {
          case 'spot':
            return this.spotClient.getSymbolPriceTicker({ symbol: rawSymbol })
          case 'futures':
            return this.futuresClient.getSymbolPriceTicker({ symbol: rawSymbol })
          case 'delivery':
            return this.deliveryClient.getSymbolPriceTicker({ symbol: rawSymbol })
        }
      },
      'GET_PRICE_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return Err({
          code: 'PRICE_NOT_FOUND',
          message: `Price for ${symbol} not found`
        })
      }
      return Ok(String(data[0].price))
    }

    return Ok(String(data.price))
  }

  /**
   * 获取 Ticker
   */
  async getTicker(symbol: string, tradeType: TradeType): Promise<Result<Ticker>> {
    const rawSymbol = unifiedToBinance(symbol, tradeType)

    const result = await wrapAsync<BinanceTickerResponse>(
      async () => {
        switch (tradeType) {
          case 'spot':
            return this.spotClient.get24hrChangeStatistics({ symbol: rawSymbol }) as Promise<BinanceTickerResponse>
          case 'futures':
            return this.futuresClient.get24hrChangeStatistics({ symbol: rawSymbol }) as Promise<BinanceTickerResponse>
          case 'delivery':
            return this.deliveryClient.get24hrChangeStatistics({ symbol: rawSymbol }) as Promise<BinanceTickerResponse>
        }
      },
      'GET_TICKER_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    return Ok({
      symbol,
      lastPrice: String(data.lastPrice),
      highPrice: String(data.highPrice),
      lowPrice: String(data.lowPrice),
      volume: String(data.volume),
      quoteVolume: String(data.quoteVolume),
      priceChangePercent: String(data.priceChangePercent),
      timestamp: data.closeTime
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
    const rawSymbol = unifiedToBinance(symbol, tradeType)
    // Binance API 只接受特定的 limit 值
    const validLimit = limit as 5 | 10 | 20 | 50 | 100 | 500 | 1000 | 5000

    const result = await wrapAsync<BinanceOrderBookResponse>(
      () => {
        switch (tradeType) {
          case 'spot':
            return this.spotClient.getOrderBook({ symbol: rawSymbol, limit: validLimit })
          case 'futures':
            return this.futuresClient.getOrderBook({ symbol: rawSymbol, limit: validLimit })
          case 'delivery':
            return this.deliveryClient.getOrderBook({ symbol: rawSymbol, limit: validLimit })
        }
      },
      'GET_ORDERBOOK_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    return Ok({
      symbol,
      bids: result.data.bids.map(([price, qty]) => [String(price), String(qty)] as [string, string]),
      asks: result.data.asks.map(([price, qty]) => [String(price), String(qty)] as [string, string]),
      timestamp: Date.now()
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

    const rawSymbol = unifiedToBinance(symbol, tradeType)

    const result = await wrapAsync<BinanceMarkPriceResponse | BinanceMarkPriceResponse[]>(
      () => {
        if (tradeType === 'futures') {
          return this.futuresClient.getMarkPrice({ symbol: rawSymbol })
        }
        return this.deliveryClient.getMarkPrice({ symbol: rawSymbol })
      },
      'GET_MARK_PRICE_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const data = result.data

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return Err({
          code: 'MARK_PRICE_NOT_FOUND',
          message: `Mark price for ${symbol} not found`
        })
      }
      return Ok(String(data[0].markPrice))
    }

    return Ok(String(data.markPrice))
  }

  /**
   * 统一格式 -> Binance 原始格式
   */
  toRawSymbol(symbol: string, tradeType: TradeType): string {
    return unifiedToBinance(symbol, tradeType)
  }

  /**
   * Binance 原始格式 -> 统一格式
   */
  fromRawSymbol(rawSymbol: string, tradeType: TradeType): string {
    return binanceToUnified(rawSymbol, tradeType)
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  private async getSpotSymbols(): Promise<Result<SymbolInfo[]>> {
    const result = await wrapAsync<{ symbols: BinanceSpotSymbol[] }>(
      () => this.spotClient.getExchangeInfo(),
      'GET_SPOT_SYMBOLS_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const symbols = result.data.symbols
      .filter(s => s.status === 'TRADING')
      .map(s => this.transformSpotSymbol(s))

    this.setCachedSymbols('spot', symbols)

    return Ok(symbols)
  }

  private async getFuturesSymbols(): Promise<Result<SymbolInfo[]>> {
    const result = await wrapAsync<{ symbols: BinanceFuturesSymbol[] }>(
      () => this.futuresClient.getExchangeInfo(),
      'GET_FUTURES_SYMBOLS_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const symbols = result.data.symbols
      .filter(s => s.status === 'TRADING')
      .map(s => this.transformFuturesSymbol(s))

    this.setCachedSymbols('futures', symbols)

    return Ok(symbols)
  }

  private async getDeliverySymbols(): Promise<Result<SymbolInfo[]>> {
    const result = await wrapAsync<{ symbols: BinanceDeliverySymbol[] }>(
      () => this.deliveryClient.getExchangeInfo(),
      'GET_DELIVERY_SYMBOLS_ERROR'
    )

    if (!result.ok) {
      return Err(result.error)
    }

    const symbols = result.data.symbols
      .filter(s => s.status === 'TRADING')
      .map(s => this.transformDeliverySymbol(s))

    this.setCachedSymbols('delivery', symbols)

    return Ok(symbols)
  }

  private transformSpotSymbol(s: BinanceSpotSymbol): SymbolInfo {
    const priceFilter = s.filters.find(f => f.filterType === 'PRICE_FILTER')
    const lotSizeFilter = s.filters.find(f => f.filterType === 'LOT_SIZE')

    const tickSize = priceFilter?.tickSize || '0.01'
    const stepSize = lotSizeFilter?.stepSize || '0.001'

    return {
      symbol: `${s.baseAsset}-${s.quoteAsset}`,
      rawSymbol: s.symbol,
      baseCurrency: s.baseAsset,
      quoteCurrency: s.quoteAsset,
      tradeType: 'spot',
      tickSize: String(tickSize),
      stepSize: String(stepSize),
      minQty: String(lotSizeFilter?.minQty) || '0',
      maxQty: String(lotSizeFilter?.maxQty) || '0',
      quantityPrecision: getDecimalPlaces(String(stepSize)),
      pricePrecision: getDecimalPlaces(String(tickSize)),
      status: s.status === 'TRADING' ? SymbolStatus.Enabled : SymbolStatus.Disabled
    }
  }

  private transformFuturesSymbol(s: BinanceFuturesSymbol): SymbolInfo {
    const priceFilter = s.filters.find(f => f.filterType === 'PRICE_FILTER')
    const lotSizeFilter = s.filters.find(f => f.filterType === 'LOT_SIZE')

    const tickSize = priceFilter?.tickSize || '0.01'
    const stepSize = lotSizeFilter?.stepSize || '0.001'

    return {
      symbol: `${s.baseAsset}-${s.quoteAsset}`,
      rawSymbol: s.symbol,
      baseCurrency: s.baseAsset,
      quoteCurrency: s.quoteAsset,
      tradeType: 'futures',
      tickSize: String(tickSize),
      stepSize: String(stepSize),
      minQty: String(lotSizeFilter?.minQty) || '0',
      maxQty: String(lotSizeFilter?.maxQty) || '0',
      quantityPrecision: s.quantityPrecision,
      pricePrecision: s.pricePrecision,
      status: s.status === 'TRADING' ? SymbolStatus.Enabled : SymbolStatus.Disabled
    }
  }

  private transformDeliverySymbol(s: BinanceDeliverySymbol): SymbolInfo {
    const priceFilter = s.filters.find(f => f.filterType === 'PRICE_FILTER')
    const lotSizeFilter = s.filters.find(f => f.filterType === 'LOT_SIZE')

    const tickSize = priceFilter?.tickSize || '0.01'
    const stepSize = lotSizeFilter?.stepSize || '1'

    return {
      symbol: `${s.baseAsset}-${s.quoteAsset}`,
      rawSymbol: s.symbol,
      baseCurrency: s.baseAsset,
      quoteCurrency: s.quoteAsset,
      tradeType: 'delivery',
      tickSize: String(tickSize),
      stepSize: String(stepSize),
      minQty: String(lotSizeFilter?.minQty) || '1',
      maxQty: String(lotSizeFilter?.maxQty) || '0',
      quantityPrecision: s.quantityPrecision,
      pricePrecision: s.pricePrecision,
      status: s.status === 'TRADING' ? SymbolStatus.Enabled : SymbolStatus.Disabled,
      contractValue: s.contractSize || 0
    }
  }
}
