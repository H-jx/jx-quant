代码风格保持现有风格

1.实现okx策略下单(binance没有)
代码参考：E:\Project\my-project\auto-trader-node\src\exchange\okx\OkxTrader.ts
资料参考：https://www.okx.com/docs-v5/zh/#order-book-trading-algo-trading-post-place-algo-order

2.为websocket也实现adapter：下单、批量下单、用户订单状态改变、余额改变
依赖包文档参考：
https://github.com/tiagosiebler/binance/blob/master/examples/WebSockets/ws-api-client.ts
https://github.com/tiagosiebler/binance/blob/master/examples/WebSockets/ws-userdata-listenkey.ts
https://github.com/tiagosiebler/binance/blob/master/examples/WebSockets/ws-userdata-wsapi.ts
https://github.com/tiagosiebler/okx-api/blob/master/examples/ws-private.ts
https://github.com/tiagosiebler/okx-api/blob/master/examples/ws-api-trade-raw.ts

原始API文档参考：
https://developers.binance.com/docs/zh-CN/derivatives/usds-margined-futures/trade/websocket-api
https://developers.binance.com/docs/zh-CN/derivatives/usds-margined-futures/user-data-streams/Start-User-Data-Stream
https://developers.binance.com/docs/zh-CN/derivatives/usds-margined-futures/user-data-streams/Event-Order-Update
https://developers.binance.com/docs/zh-CN/derivatives/usds-margined-futures/account/websocket-api
https://www.okx.com/docs-v5/zh/#order-book-trading-trade-ws-place-order