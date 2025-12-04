/**
 * hquant-core Node.js 绑定
 *
 * 注意: 这是一个占位文件，实际实现需要使用 napi-rs 构建
 * 运行 `pnpm build` 后会生成 .node 文件
 */

const path = require('path');

// 尝试加载原生模块
let nativeBinding = null;
const loadErrors = [];

const platforms = [
  `hquant-core.${process.platform}-${process.arch}.node`,
  `hquant-core.${process.platform}.node`,
  'hquant-core.node',
];

for (const platform of platforms) {
  try {
    nativeBinding = require(path.join(__dirname, platform));
    break;
  } catch (e) {
    loadErrors.push(e.message);
  }
}

// 如果原生模块不可用，提供 JS fallback (仅用于开发测试)
if (!nativeBinding) {
  console.warn('[hquant-core] Native module not found, using JS fallback');
  console.warn('Load errors:', loadErrors);

  // 简单的 JS 实现作为 fallback
  class HQuant {
    constructor(capacity) {
      this._capacity = capacity;
      this._klines = [];
      this._indicators = new Map();
    }

    addMA(name, period, maxHistory = 120) {
      this._indicators.set(name, {
        type: 'ma',
        period,
        maxHistory,
        values: [],
        buffer: [],
      });
    }

    addBOLL(name, period, stdFactor, maxHistory = 120) {
      this._indicators.set(name, {
        type: 'boll',
        period,
        stdFactor,
        maxHistory,
        values: [],
      });
    }

    addRSI(name, period, maxHistory = 120) {
      this._indicators.set(name, {
        type: 'rsi',
        period,
        maxHistory,
        values: [],
        avgGain: 0,
        avgLoss: 0,
      });
    }

    addMACD(name, shortPeriod, longPeriod, signalPeriod, maxHistory = 120) {
      this._indicators.set(name, {
        type: 'macd',
        shortPeriod,
        longPeriod,
        signalPeriod,
        maxHistory,
        values: [],
      });
    }

    addATR(name, period, maxHistory = 120) {
      this._indicators.set(name, { type: 'atr', period, maxHistory, values: [] });
    }

    addVRI(name, period, maxHistory = 120) {
      this._indicators.set(name, { type: 'vri', period, maxHistory, values: [] });
    }

    addKline(kline) {
      this._klines.push(kline);
      if (this._klines.length > this._capacity) {
        this._klines.shift();
      }
      this._updateIndicators(kline);
    }

    updateLast(kline) {
      if (this._klines.length > 0) {
        this._klines[this._klines.length - 1] = kline;
      }
    }

    importJson(json) {
      const klines = JSON.parse(json);
      for (const k of klines) {
        this.addKline({
          open: Number(k.open),
          close: Number(k.close),
          high: Number(k.high),
          low: Number(k.low),
          volume: Number(k.volume),
          timestamp: k.timestamp,
        });
      }
    }

    importBinary(buffer) {
      throw new Error('Binary import not supported in JS fallback');
    }

    getMA(name, index = -1) {
      const ind = this._indicators.get(name);
      if (!ind || ind.values.length === 0) return NaN;
      const i = index < 0 ? ind.values.length + index : index;
      return ind.values[i] ?? NaN;
    }

    getBOLL(name, index = -1) {
      // Simplified
      return { up: NaN, mid: NaN, low: NaN };
    }

    getRSI(name, index = -1) {
      return this.getMA(name, index);
    }

    getMACD(name, index = -1) {
      return { macd: NaN, signal: NaN, histogram: NaN };
    }

    getATR(name, index = -1) {
      return this.getMA(name, index);
    }

    getVRI(name, index = -1) {
      return this.getMA(name, index);
    }

    klineCount() {
      return this._klines.length;
    }

    indicatorLen(name) {
      const ind = this._indicators.get(name);
      return ind ? ind.values.length : 0;
    }

    exportBinary() {
      throw new Error('Binary export not supported in JS fallback');
    }

    _updateIndicators(kline) {
      for (const [name, ind] of this._indicators) {
        if (ind.type === 'ma') {
          ind.buffer.push(kline.close);
          if (ind.buffer.length > ind.period) {
            ind.buffer.shift();
          }
          if (ind.buffer.length >= ind.period) {
            const sum = ind.buffer.reduce((a, b) => a + b, 0);
            ind.values.push(sum / ind.period);
          } else {
            ind.values.push(NaN);
          }
          if (ind.values.length > ind.maxHistory) {
            ind.values.shift();
          }
        }
        // 其他指标简化处理...
      }
    }
  }

  module.exports = { HQuant };
} else {
  module.exports = nativeBinding;
}
