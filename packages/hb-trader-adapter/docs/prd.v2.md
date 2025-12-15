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
   - 将 OKX 所需的字段（如 `algoType`、`triggerPrice`、`algoPrice`）通过适配器转换为统一的 `TradeOrderRequest`。
   - 添加错误码映射，复用 `errorCodes.ts` 并补充 OKX 专用映射规则。
   - 在 `src/adapters/index.ts` 中注册 OKX Trade Adapter，使上层交易逻辑统一调用。

2. **WebSocket Adapter**
   - 基于 `BasePublicAdapter` / `BaseTradeAdapter` 的结构，拆分公/私有流的连接管理。
   - 实现下列事件的处理器并通过适配器事件回调暴露：
     * 单笔下单（All-in-one order 提交和确认推送）
     * 批量下单（针对 OKX 支持的 bulk order API）
     * 订单状态变更（挂单、成交、撤单等）
     * 余额或资金变更通知
   - 重新使用钩子/事件写法，保持与 Binance Adapter 类似的外部接口。
   - 设置自动重连 + 心跳/订阅逻辑，参考 tiagosiebler 的示例代码处理 listenKey/订阅事件。
   - 确保 WebSocket 推送在 `src/public.ts` / `src/trader.ts` 的示例中可被复用。

3. **测试与文档**
   - 编写 vitest 单元测试模拟 OKX 策略下单的参数转换与错误处理（可参考 `tests/utils.test.ts`）。
   - 补充文档说明 OKX Algo 下单与 WS Adapter 的使用方式，更新 `README.md` 或新增 `docs/okx-ws.md`。

4. **字段一致化层**
   - 定义一个中台协议 `UnifiedOrderFields` / `UnifiedAccountFields` ，涵盖两端共有的核心字段（`symbol`、`side`、`orderQty`/`size`、`price`、`stopPrice`、`timeInForce`、`algoType` 等）。
   - 在适配器内部引入 `fieldNormalizer.ts` 或同名工具，负责：
     * 按照当前平台（Binance / OKX）拆解或补全唯一字段（如 OKX 的 `algoType` vs Binance 的 `orderType` + `stopPrice`）。
     * 将返回的事件或订单对象映射回统一结构，避免上下游处理分叉。
   - 在 `errorCodes.ts` 附带一个 `platformContext` 字段，便于错误堆栈中直接识别是 OKX 还是 Binance，并触发不同的恢复/重试策略。
   - 增加自描述的 mapping/config 片段（JSON/TS 的 `FieldMap`）在 `src/adapters` 中共享，使后续新增平台只需补充映射表。

5. **共享下单类型**
   - 复用 `src/types.ts` 中的 `PlaceOrderParams` 作为 OKX REST/WS 下单请求的统一输入定义，确保两端都有一致的基础字段，详见 [packages/hb-trader-adapter/src/types.ts](packages/hb-trader-adapter/src/types.ts#L149-L187)。
   - 上层调用只需构造 `TradeOrderRequest`（同 `PlaceOrderParams`）后交给适配器，内部再根据 `tradeType`、`orderType` 派生出平台特定 payload。这样能避免重复校验 `symbol`/`side`/`price` 等字段的逻辑。
   - `BaseTradeAdapter` 中已有 `formatOrderParams` 与 `validateOrderParams` 可直接复用，OKX 只需在 `OkxTradeAdapter` 内扩展 `doPlaceOrder`，在调用前复用该流程确保字段合法性。

## 字段对齐举例
- `orderQty`：Binance 通过 `quantity`/`size`，OKX 通过 `sz` / `size`，统一封装为 `orderQty`。
- `algoType`：OKX 直接传入，Binance 通过 `orderType` + `stopPrice` 推导。通过 `fieldNormalizer` 输出 `algoType` + `triggerCondition`。
- `strategyTag`：二者均支持标记字段但名称不同（`newClientOrderId` / `tag`），适配器填充 `strategyTag` 并回传。
- `positionSide`：只在双向持仓模式生效，字段需按平台特性治理后再映射到 `positionMode`。
- 余额字段：OKX `availBal`、`totalBal`，Binance `availableBalance`、`totalWalletBalance`，统一为 `freeBalance`/`lockedBalance`。

## 运营指南
- 先在测试环境对照 okx/binance 的 demo piping，验证 `fieldNormalizer` 的双向转换。
- 每次新增字段需同步 `Unified` 接口，并通过 vitest 的 snapshot 确认两个平台序列化结果一致。

## 依赖与风险
- 需要同步 `auto-trader-node` 中 OKX 相关实现，确保字段对齐。
- WebSocket 依赖 Listen Key 机制，需在 adapter 中封装自动续期。
- 订单状态之间的状态映射需与策略引擎保持一致，测试覆盖不可缺少。

## 交付物
1. OKX 策略下单 REST Adapter 实现（含参数转换、错误码、注册逻辑）。
2. OKX WebSocket Adapter，暴露下单与余额/订单更新事件。
3. 更新的测试与文档，便于团队复用。

## 后续建议
1. 可在 docs 中补充 WebSocket 事件流程图与重连策略。
2. 将 OKX 与 Binance 的公共逻辑抽成共享 utils，避免重复代码。
3. 根据实际暴露的事件，编写 integration test 验证处理链路。
