
import { RiskModel } from "../../../trader/RiskModel";



describe('RiskModel', () => {
  it('stopLoss', () => {
    const riskModel = new RiskModel();
    riskModel.updateConfig('TRBUSDT', {
        stopLoss: -0.01,
        stopProfit: 0.02
    });
    const tradeFlag = {
        "SELLLONG": 0,
        "BUYSHORT": 0
    }
    riskModel.on('order', (data) => {
        tradeFlag[`${data.side}${data.positionSide}`]++;
    })
    riskModel.updateBalance([
        {
            asset: "USDT",
            balance: '1000',
            crossUnPnl: '-10',
            availableBalance : '990'
        },
    ],'futures');
    // 回报率 = 未实现盈亏 / 初始保证金，请选择未实现盈亏和初始保证金的价格基准。
    // 标记价格     保证金比例    保证金)          盈亏   回报率 
    // 115.151     0.15%     34.55 USDT (全仓)  -0.8249 USDT (-2.38%)
    riskModel.updatePositions([
        {
            entryPrice: '114.876',
            leverage: '10',
            markPrice: '115.151',
            positionAmt: '3',
            symbol: 'TRBUSDT',
            positionSide: 'SHORT',
        }
    ], 'futures')
    expect(tradeFlag['BUYSHORT']).toBe(1);

  });
  it('stopProfit', () => {
    const riskModel = new RiskModel();
    riskModel.updateConfig('TRBUSDT', {
        stopLoss: -0.01,
        stopProfit: 0.02
    });
    const tradeFlag = {
        "SELLLONG": 0,
        "BUYSHORT": 0
    }
    riskModel.on('order', (data) => {
        tradeFlag[`${data.side}${data.positionSide}`]++;
    })
    riskModel.updateBalance([
        {
            asset: "USDT",
            balance: '1000',
            crossUnPnl: '10',
            availableBalance : '990'
        }
    ], 'futures');
    riskModel.updatePositions([
        {
            entryPrice: '114.876',
            leverage: '10',
            markPrice: '113.151',
            positionAmt: '3',
            symbol: 'TRBUSDT',
            positionSide: 'SHORT',
        }
    ], 'futures')
    expect(tradeFlag['BUYSHORT']).toBe(1);

  });
});