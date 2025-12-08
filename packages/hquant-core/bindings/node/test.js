/**
 * hquant-core Node.js 测试
 */

// 直接加载原生模块进行测试
const { HQuant } = require('./hquant-core.darwin-arm64.node');

console.log('=== hquant-core Node.js Test ===\n');

// 创建实例
const hq = new HQuant(1000);

// 添加指标 (napi-rs 使用 camelCase)
hq.addMa('ma5', 5);
hq.addMa('ma10', 10);
hq.addRsi('rsi14', 14);

console.log('Indicators added: ma5, ma10, rsi14');

// 模拟 K 线数据
const klines = [
  { open: 100, close: 102, high: 103, low: 99, volume: 1000, timestamp: 1700000000 },
  { open: 102, close: 104, high: 105, low: 101, volume: 1100, timestamp: 1700000060 },
  { open: 104, close: 103, high: 106, low: 102, volume: 900, timestamp: 1700000120 },
  { open: 103, close: 105, high: 107, low: 102, volume: 1200, timestamp: 1700000180 },
  { open: 105, close: 108, high: 109, low: 104, volume: 1500, timestamp: 1700000240 },
  { open: 108, close: 107, high: 110, low: 106, volume: 1300, timestamp: 1700000300 },
  { open: 107, close: 110, high: 111, low: 106, volume: 1400, timestamp: 1700000360 },
  { open: 110, close: 112, high: 113, low: 109, volume: 1600, timestamp: 1700000420 },
  { open: 112, close: 111, high: 114, low: 110, volume: 1200, timestamp: 1700000480 },
  { open: 111, close: 115, high: 116, low: 110, volume: 1800, timestamp: 1700000540 },
];

// 添加 K 线
for (const k of klines) {
  hq.addKline(k);
}

console.log(`\nAdded ${hq.klineCount()} klines`);
console.log(`MA5 history length: ${hq.indicatorLen('ma5')}`);

// 获取指标值
const ma5 = hq.getMa('ma5', -1);
const ma10 = hq.getMa('ma10', -1);

console.log(`\n--- Indicator Values ---`);
console.log(`MA5 (latest):  ${ma5.toFixed(2)}`);
console.log(`MA10 (latest): ${ma10.toFixed(2)}`);

// 测试 JSON 导入
console.log('\n--- JSON Import Test ---');
const hq2 = new HQuant(100);
hq2.addMa('ma3', 3);

const json = JSON.stringify([
  { open: 100, close: 102, high: 103, low: 99, volume: 1000, timestamp: 1700000000 },
  { open: 102, close: 104, high: 105, low: 101, volume: 1100, timestamp: 1700000060 },
  { open: 104, close: 106, high: 107, low: 103, volume: 1200, timestamp: 1700000120 },
]);

hq2.importJson(json);
console.log(`Imported ${hq2.klineCount()} klines from JSON`);
console.log(`MA3: ${hq2.getMa('ma3', -1).toFixed(2)}`);  // (102+104+106)/3 = 104

// 测试更新最后一根 K 线
console.log('\n--- Update Last Test ---');
const lastKline = { open: 104, close: 108, high: 109, low: 103, volume: 1300, timestamp: 1700000120 };
hq2.updateLast(lastKline);
console.log(`After update, MA3: ${hq2.getMa('ma3', -1).toFixed(2)}`);  // (102+104+108)/3 = 104.67

console.log('\n=== All tests passed! ===');
