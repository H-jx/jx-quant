# OKX 接口扩展技术方案

## 目标
- 实现 OKX 策略下单能力（当前仅 Binance 具备），保持现有代码风格和抽象边界。
- 为 WebSocket 用户数据流补全 Adapter 层，支持下单、批量下单、用户订单状态和余额变化事件推送。
- 提供可复用的公共入口，让自动交易服务与 OKX 的 REST 与 WebSocket 接口保持一致的调用方式。

## 现有参考
1. OKX 策略下单参考实现：
   - 参考 `E:\Project\my-project\auto-trader-node\src\exchange\okx\OkxTrader.ts` 的参数结构和下单流程。
   - 了解 OKX 订单类型与策略字段的映射关系。
2. WebSocket 适配开发参考资料：
   - Binance ws-client 示例：
     * https://github.com/tiagosiebler/binance/blob/master/examples/WebSockets/ws-api-client.ts
     * https://github.com/tiagosiebler/binance/blob/master/examples/WebSockets/ws-userdata-listenkey.ts
     * https://github.com/tiagosiebler/binance/blob/master/examples/WebSockets/ws-userdata-wsapi.ts
   - OKX ws 相关示例：
     * https://github.com/tiagosiebler/okx-api/blob/master/examples/ws-private.ts
     * https://github.com/tiagosiebler/okx-api/blob/master/examples/ws-api-trade-raw.ts
3. 原始 API 文档：
   - https://www.okx.com/docs-v5/zh/#order-book-trading-algo-trading-post-place-algo-order
   - https://developers.binance.com/docs/zh-CN/derivatives/usds-margined-futures/trade/websocket-api
   - https://developers.binance.com/docs/zh-CN/derivatives/usds-margined-futures/user-data-streams/Start-User-Data-Stream
   - https://developers.binance.com/docs/zh-CN/derivatives/usds-margined-futures/user-data-streams/Event-Order-Update
   - https://developers.binance.com/docs/zh-CN/derivatives/usds-margined-futures/account/websocket-api

## 技术设计
1. **REST 策略下单**
   - 复用 `BaseTradeAdapter`，新增 OKX 策略下单（algo order）接口。
   - 复用 `BaseTradeAdapter`，新增 binance 策略下单（algo order）接口 [submitNewAlgoOrder](https://github.com/tiagosiebler/binance/blob/master/src/usdm-client.ts#L631C3-L631C21)  https://developers.binance.com/docs/zh-CN/derivatives/usds-margined-futures/trade/rest-api/New-Algo-Order
   - 必须字段 instId、side、sz、posSide
   - 将 OKX 所需的字段（ `algoType`、`triggerPrice`、`algoPrice`、 `tpOrdPx`、`slTriggerPx`、`slOrdPx`、`tpTriggerPx`）， binance 字段类似，以币安字段为准统一参数名，通过适配器转换为统一的`TradeAlgoOrderRequest`。
   - triggerPxType = "last"
   - ordType = "trigger"
   - tdMode = "cash" 
   - 添加错误码映射，复用 `errorCodes.ts` 并补充 OKX 专用映射规则。
   - 在 `src/adapters/index.ts` 中注册 OKX Trade Adapter，使上层交易逻辑统一调用。

2. **WebSocket Adapter**
   - 基于 `BasePublicAdapter` / `BaseTradeAdapter` 的结构，拆分公/私有流的连接管理。
   - 实现下列事件的处理器并通过适配器事件回调暴露：
     * 单笔下单（All-in-one order 提交和确认推送）(现货、u本位合， 币本位暂时不支持)
     * 批量下单（如果某个平台没有，就复用单笔下单）(现货、u本位合， 币本位暂时不支持)
     * 批量策略下单
     * 订单状态变更（挂单、成交、撤单等）
     * 余额或资金变更通知
   - 重新使用钩子/事件写法，保持与 Binance Adapter 类似的外部接口。
   - listenKey 续订。
   - 确保 输入参数统一， 校验统一， 真正下单时再分别一一对应。

3. **测试与文档**
   - 编写 packages\hb-trader-adapter\example 测试单个下单、批量下单、策略批量下单案例。参考packages\hb-trader-adapter\example\trader.ts
   - 补充文档说明 OKX Algo 下单与 WS Adapter 的使用方式，更新 `README.md` 或新增 `docs/okx-ws.md`。

4. **字段一致化层**
   - 单个下单字段复用PlaceOrderParams、
   - 单个策略下单根据okx，binance 两个平台抽象出一个统一字段 TradeAlgoOrderRequest

5. **共享下单类型**
   - 复用 `src/types.ts` 中的 `PlaceOrderParams` 作为 OKX REST/WS 下单请求的统一输入定义，确保两端都有一致的基础字段，详见 [packages/hb-trader-adapter/src/types.ts](packages/hb-trader-adapter/src/types.ts#L149-L187)。
   - 上层调用只需构造 `TradeOrderRequest`（同 `PlaceOrderParams`）后交给适配器，内部再根据 `tradeType`、`orderType` 派生出平台特定 payload。这样能避免重复校验 `symbol`/`side`/`price` 等字段的逻辑。
   - `BaseTradeAdapter` 中已有 `formatOrderParams` 与 `validateOrderParams` 可直接复用，OKX 只需在 `OkxTradeAdapter` 内扩展 `doPlaceOrder`，在调用前复用该流程确保字段合法性。

## 字段对齐举例
- `orderQty`：Binance 通过 `quantity`/`size`，OKX 通过 `sz` / `size`，统一封装为 `orderQty`。
- `algoType`：OKX + Binance 抽象 止盈止损 就行。
- `positionSide`：只在双向持仓模式生效，字段需按平台特性治理后再映射到 `positionMode`。
- 余额字段：OKX `availBal`、`totalBal`，Binance `availableBalance`、`totalWalletBalance`，统一为 `availableBalance`/`totalWalletBalance`。


## 后续建议
2. 将 OKX 与 Binance 的公共逻辑抽成共享 utils，避免重复代码。
