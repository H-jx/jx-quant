import { describe, it, expect } from 'vitest'
import {
  truncateDecimal,
  adjustByStep,
  getDecimalPlaces,
  formatPrice,
  formatQuantity,
  parseUnifiedSymbol,
  createUnifiedSymbol,
  unifiedToOkx,
  unifiedToBinance,
  okxToUnified,
  binanceToUnified,
  getOkxInstType,
  getOkxTdMode,
  getContractValue,
  usdtToContracts,
  coinToContracts,
  contractsToCoin,
  wrapAsync,
  Ok,
  Err,
  extractOkxError,
  extractBinanceError,
  isValidTradeType,
  isValidExchange
} from '../src/utils'
import { InstrumentType, TradeMode } from 'okx-api'

describe('utils', () => {
  describe('Precision Handling', () => {
    it('getDecimalPlaces', () => {
      expect(getDecimalPlaces('0.1')).toBe(1)
      expect(getDecimalPlaces('0.0001')).toBe(4)
      expect(getDecimalPlaces('100')).toBe(0)
      expect(getDecimalPlaces('100.0')).toBe(1)
    })

    it('truncateDecimal', () => {
      expect(truncateDecimal(1.239, 2)).toBe('1.23')
      expect(truncateDecimal('1.999', 2)).toBe('1.99')
      expect(truncateDecimal(1.23, 5)).toBe('1.23000')
      expect(truncateDecimal(0, 2)).toBe('0.00')
    })

    it('adjustByStep', () => {
      expect(adjustByStep(1.2345, '0.01')).toBe('1.23')
      expect(adjustByStep(1.239, '0.01')).toBe('1.23')
      expect(adjustByStep(1.99, '0.1')).toBe('1.9')
      expect(adjustByStep(1234, '10')).toBe('1230')
      expect(adjustByStep(0.00034, '0.0001')).toBe('0.0003')
    })

    it('formatPrice', () => {
      // alias for adjustByStep
      expect(formatPrice(51234.56, '0.1')).toBe('51234.5')
      expect(formatPrice(51234.56, '1')).toBe('51234')
    })

    it('formatQuantity', () => {
      // alias for adjustByStep
      expect(formatQuantity(0.12345, '0.001')).toBe('0.123')
      expect(formatQuantity(15.8, '1')).toBe('15')
    })
  })

  describe('Symbol Conversion', () => {
    it('parseUnifiedSymbol', () => {
      expect(parseUnifiedSymbol('BTC-USDT')).toEqual({ base: 'BTC', quote: 'USDT' })
      expect(parseUnifiedSymbol('ETH-BTC')).toEqual({ base: 'ETH', quote: 'BTC' })
    })

    it('createUnifiedSymbol', () => {
      expect(createUnifiedSymbol('btc', 'usdt')).toBe('BTC-USDT')
    })

    it('unifiedToOkx', () => {
      expect(unifiedToOkx('BTC-USDT', 'spot')).toBe('BTC-USDT')
      expect(unifiedToOkx('BTC-USDT', 'futures')).toBe('BTC-USDT-SWAP')
      expect(unifiedToOkx('BTC-USDT', 'delivery')).toBe('BTC-USDT') // delivery is special
    })

    it('okxToUnified', () => {
      expect(okxToUnified('BTC-USDT')).toEqual({ symbol: 'BTC-USDT', tradeType: 'spot' })
      expect(okxToUnified('BTC-USDT-SWAP')).toEqual({ symbol: 'BTC-USDT', tradeType: 'futures' })
      expect(okxToUnified('BTC-USDT-241227')).toEqual({ symbol: 'BTC-USDT', tradeType: 'delivery' })
    })

    it('unifiedToBinance', () => {
      expect(unifiedToBinance('BTC-USDT', 'spot')).toBe('BTCUSDT')
      expect(unifiedToBinance('BTC-USDT', 'futures')).toBe('BTCUSDT')
      expect(unifiedToBinance('BTC-USD', 'delivery')).toBe('BTCUSD_PERP')
    })

    it('binanceToUnified', () => {
      expect(binanceToUnified('BTCUSDT', 'spot')).toBe('BTC-USDT')
      expect(binanceToUnified('ETHUSDT', 'futures')).toBe('ETH-USDT')
      expect(binanceToUnified('BTCUSD_PERP', 'delivery')).toBe('BTC-USD')
      expect(binanceToUnified('BTCUSD_241227', 'delivery')).toBe('BTC-USD')
    })
  })

  describe('OKX Client Conversion', () => {
    it('getOkxInstType', () => {
      expect(getOkxInstType('spot')).toBe<InstrumentType>('SPOT')
      expect(getOkxInstType('futures')).toBe<InstrumentType>('SWAP')
      expect(getOkxInstType('delivery')).toBe<InstrumentType>('FUTURES')
    })

    it('getOkxTdMode', () => {
      expect(getOkxTdMode('spot')).toBe<TradeMode>('cash')
      expect(getOkxTdMode('futures', 'cross')).toBe<TradeMode>('cross')
      expect(getOkxTdMode('delivery', 'isolated')).toBe<TradeMode>('isolated')
    })
  })

  describe('Coin-Margined Contract Utils', () => {
    const btcPrice = 50000
    const ethPrice = 4000

    it('getContractValue', () => {
      expect(getContractValue('BTC-USD')).toBe(100)
      expect(getContractValue('ETH-USD')).toBe(10)
    })

    it('usdtToContracts', () => {
      // Note: This function seems to have a simplified logic in utils.ts
      // Formula used is: Math.floor(usdt / contractValue)
      expect(usdtToContracts('BTC-USD', 1000, btcPrice)).toBe(10) // 1000 / 100
      expect(usdtToContracts('ETH-USD', 1000, ethPrice)).toBe(100) // 1000 / 10
    })

    it('coinToContracts', () => {
      // Formula: Math.floor(coinAmount * price / contractValue)
      expect(coinToContracts('BTC-USD', 0.5, btcPrice)).toBe(250) // 0.5 * 50000 / 100
      expect(coinToContracts('ETH-USD', 10, ethPrice)).toBe(4000) // 10 * 4000 / 10
    })

    it('contractsToCoin', () => {
      // Formula: contracts * contractValue / price
      expect(contractsToCoin('BTC-USD', 250, btcPrice)).toBe(0.5) // 250 * 100 / 50000
      expect(contractsToCoin('ETH-USD', 4000, ethPrice)).toBe(10) // 4000 * 10 / 4000
    })
  })

  describe('Error Handling', () => {
    it('wrapAsync should return Ok on success', async () => {
      const successPromise = () => Promise.resolve('data')
      const result = await wrapAsync(successPromise)
      expect(result).toEqual(Ok('data'))
    })

    it('wrapAsync should return Err on failure', async () => {
      const error = new Error('test error')
      const failurePromise = () => Promise.reject(error)
      const result = await wrapAsync(failurePromise, 'TEST_ERROR')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('TEST_ERROR')
        expect(result.error.message).toBe('test error')
      }
    })

    it('extractOkxError', () => {
      const err1 = { code: '51001', msg: 'Order does not exist' }
      expect(extractOkxError(err1)).toEqual({ code: '51001', message: 'Order does not exist', raw: err1 })

      const err2 = { code: '0', data: [{ sCode: '51002', sMsg: 'Order cancelled' }] }
      expect(extractOkxError(err2)).toEqual({ code: '51002', message: 'Order cancelled', raw: err2 })

      const success = { code: '0', msg: '', data: [] }
      expect(extractOkxError(success)).toBeNull()
    })

    it('extractBinanceError', () => {
      const err = { code: -2011, msg: 'Unknown order sent.' }
      expect(extractBinanceError(err)).toEqual({ code: '-2011', message: 'Unknown order sent.', raw: err })

      const success = { status: 'OK' } // not an error object
      expect(extractBinanceError(success)).toBeNull()
    })
  })
  
  describe('Type Guards', () => {
    it('isValidTradeType', () => {
      expect(isValidTradeType('spot')).toBe(true)
      expect(isValidTradeType('futures')).toBe(true)
      expect(isValidTradeType('delivery')).toBe(true)
      expect(isValidTradeType('option')).toBe(false)
      expect(isValidTradeType(null)).toBe(false)
      expect(isValidTradeType(undefined)).toBe(false)
    })

    it('isValidExchange', () => {
      expect(isValidExchange('okx')).toBe(true)
      expect(isValidExchange('binance')).toBe(true)
      expect(isValidExchange('coinbase')).toBe(false)
      expect(isValidExchange(123)).toBe(false)
    })
  })

  describe('Result helpers', () => {
    it('Ok should wrap data', () => {
      expect(Ok(42)).toEqual({ ok: true, data: 42 })
      expect(Ok({ a: 1 })).toEqual({ ok: true, data: { a: 1 } })
    })

    it('Err should wrap error', () => {
      const error = { code: 'E', message: 'msg' }
      expect(Err(error)).toEqual({ ok: false, error: error })
    })
  })
})
