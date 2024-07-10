
import { OrderSide, PositionSide, FuturesPosition, FuturesBalance } from "./interface";
import { autoToFixed } from "./util";

interface BacktestParams {
  accountValue: number;
  /** 合约倍数 */
  leverage?: number;
  makerFee?: number;
  takerFee?: number;
}
const DIRECTION_MAP = {
  "LONG": 1,
  "SHORT": -1,
  "BUY_BOTH": 1,
  "SELL_BOTH": -1,
}

export function getDirection(position: Omit<FuturesPosition, 'symbol' | 'autoTradeType'>): 1 | -1 {
  return DIRECTION_MAP[`${position.positionSide}`]
}
export function getProfitByPosition(position: Omit<FuturesPosition, 'symbol' | 'autoTradeType'>): number {
  const markPrice = Number(position.markPrice);
  const positionAmt = Math.abs(Number(position.positionAmt));
  const entryPrice = Number(position.entryPrice);
  const diffPrice = (markPrice - entryPrice) * getDirection(position);
  const profit = diffPrice * positionAmt;
  return profit;
}

export interface Trade {
  time: number;
  price: number;
  volume?: number;
  side?: OrderSide;
  positionSide?: PositionSide;
  text?: string;
}

interface Position extends Omit<FuturesPosition, 'symbol' | 'autoTradeType'>{
  entryPrice: number;
  exitPrice?: number;
  positionAmt: number;
  side: OrderSide;
  text?: string;
}

interface FuturesBacktestResult {
  currentAsset: number;
  profit: number;
  profitRate: number;
  maxDrawdownRate: number;
  buyCount: number;
  sellCount: number;
}


export class FuturesBacktest {
  private usdtBalance = {
    asset: 'USDT',
    balance: 0,   // 总余额
    crossWalletBalance: 0, // 全仓余额
    // 全仓持仓未实现盈亏
    crossUnPnl: 0,
    // 下单可用余额
    availableBalance: 0,
  }
  /** 合约倍数 */
  private leverage: number;
  private makerFee: number;
  private takerFee: number;
  private maxDrawdownRate: number;
  private maxAssetValue = 0;
  private initialAssetValue: number;
  private trades: Position[] = [];
  private buyCount = 0;
  private sellCount = 0;

  positions: Position[];
  maintMarginPercent = 0.25;
  liquidationPrice = 0;
  constructor(params: BacktestParams) {
    this.initialAssetValue = params.accountValue;
    this.leverage = params.leverage || 1;
    this.makerFee = params.makerFee || 0.03;
    this.takerFee = params.takerFee || 0.03;
    this.reset();
  }
  public reset() {
    this.usdtBalance.crossWalletBalance =  this.initialAssetValue;
    this.usdtBalance.availableBalance =  this.initialAssetValue;
    this.positions = [];
    this.trades = [];
    this.liquidationPrice = 0;
    this.maxDrawdownRate = 0;
  }
  updateLiquidationPrice() {
    let sumVolume = 0;
    let sumNotional = 0;
    // 持仓收益更新，检查是否爆仓
    for(let i = 0; i < this.positions.length; i++) {
      const p = this.positions[i];
      sumNotional = this.calculateNotional(p);
      sumVolume += p.positionAmt;
    }
    // 維持保證金 = 名義價值 * 維持保證金率 - 維持保證金速算額
    const maintenanceMargin = sumNotional * this.maintMarginPercent - 0;

    this.liquidationPrice = maintenanceMargin / sumVolume;
    return maintenanceMargin
  }
  public getInitialAccountValue(): number {
    return this.initialAssetValue;
  }
  /**
   * 获取未实现盈亏
   */
  public getCrossUnPnl(): number {
    const profit = this.positions.reduce((acc, p) => getProfitByPosition(p), 0);
    return profit;
  }
  /** 计算保證金 */
  private calculateMargin(position: Position): number {
    const notional = this.calculateNotional(position); // 仓位面值
    const margin = notional / Number(position.leverage); // 保证金
    return margin
  }
   /** 计算订单名义价值 */
   private calculateNotional(position: Position): number {
    return position.positionAmt * Number(position.markPrice); // 仓位面值
  }

  public updateBalance(): void {
    const crossUnPnl = this.getCrossUnPnl();
    this.usdtBalance.crossUnPnl = crossUnPnl;
    this.usdtBalance.availableBalance = this.usdtBalance.crossWalletBalance + crossUnPnl;

    if (this.maxAssetValue === null || this.usdtBalance.availableBalance > this.maxAssetValue) {
      this.maxAssetValue = this.usdtBalance.availableBalance;
    }
    const drawdown = (this.usdtBalance.availableBalance - this.maxAssetValue) / this.maxAssetValue;

    // 求最大回测，考虑负数
    if (drawdown < this.maxDrawdownRate) {
      this.maxDrawdownRate = drawdown;
    }
  }
  public getPosition(positionSide: 'LONG' | 'SHORT') {
    for (let i = 0; i < this.positions.length; i++) {
      const position = this.positions[i];
      if (position.positionSide > positionSide) {
        return position
      }
    }
  }

  public mockTrade(trade: Trade): void {
    const fee = trade.side === "BUY" ? this.takerFee : this.makerFee;

    const callers = {
      "BUY-LONG": this.openPosition,
      "SELL-SHORT": this.openPosition,
      "BUY-SHORT": this.closePosition,
      "SELL-LONG": this.closePosition
    };

    const caller = callers[`${trade.side}-${trade.positionSide}`];

    if(caller) {
      caller.call(this, trade.positionSide, trade.price, trade.volume, fee);
    }
    for(let i = 0; i < this.positions.length; i++) {
      const p = this.positions[i];
      p.markPrice = trade.price;
    }
    const maintenanceMargin = this.updateLiquidationPrice();
    this.updateBalance();
    if (this.usdtBalance.availableBalance <= maintenanceMargin) {
      console.error(`爆仓(${trade.price} ${new Date(trade.time).toLocaleString()})`, this.usdtBalance, this.positions)
      this.reset();
      throw 'Liquidation';
    }
  }
  public getAccountInfo(): FuturesBalance {
    this.updateBalance();
    return this.usdtBalance
  }
  public getResult(): FuturesBacktestResult {
    this.updateBalance();
    const profit = this.usdtBalance.availableBalance - this.initialAssetValue;
    // console.log(this.usdtBalance.availableBalance, this.initialAssetValue)
    return {
      currentAsset: this.usdtBalance.availableBalance,
      profit: autoToFixed(profit),
      profitRate: autoToFixed(profit / this.initialAssetValue),
      maxDrawdownRate: this.maxDrawdownRate,
      buyCount: this.buyCount,
      sellCount: this.sellCount,
    };
  }

  public getTrades(): Position[] {
    return this.trades;
  }
  /** 开单 */
  private openPosition(
    positionSide: "LONG" | "SHORT",
    entryPrice: number,
    volume: number,
    fee: number
  ): void {
    if (this.usdtBalance.availableBalance < volume) {
      return;
    }
    // 开多
    if (positionSide === "LONG") {
      const position = this.positions.find(
        p => p.positionSide === "LONG"
      );
      if (position) {
        const totalVolume = position.positionAmt + volume;
        const totalCost = position.positionAmt * position.entryPrice + volume * entryPrice;
        const averageEntryPrice = totalCost / totalVolume;
        position.positionAmt = totalVolume;
        position.entryPrice = averageEntryPrice;
        // this.usdtBalance.availableBalance -= this.calculateMargin(position);
      } else {
        this.positions.push({
          entryPrice,
          leverage: this.leverage,
          markPrice: entryPrice,
          side: "BUY",
          positionSide: "LONG",
          positionAmt: volume,
          text: '多单'
        });
      }
      this.buyCount++;
      // console.log('开多', entryPrice, this.assetValue, this.quoteAmount)
    }
    // 开空
    if (positionSide === "SHORT") {
      const position = this.positions.find(
        p => p.positionSide === "SHORT"
      );
      if (position) {
        const totalVolume = position.positionAmt + volume;
        const totalCost = position.positionAmt * position.entryPrice + volume * entryPrice;
        const averageEntryPrice = totalCost / totalVolume;
        position.positionAmt = totalVolume;
        position.entryPrice = averageEntryPrice;
      } else {
        this.positions.push({
          entryPrice,
          markPrice: entryPrice,
          leverage: this.leverage,
          side: "SELL",
          positionSide: "SHORT",
          positionAmt: volume,
          text: "空单"
        });
      }
      this.sellCount++;
      // console.log('开空', entryPrice, this.assetValue, this.quoteAmount)
    }
  
    const cost = (volume * entryPrice * fee);
    this.usdtBalance.crossWalletBalance -= cost;
  }
  /** 平单 */
  private closePosition(
    positionSide: "LONG" | "SHORT",
    exitPrice: number,
    volume: number,
    fee: number
  ): void {
    // 1. 平多
    if (positionSide === "LONG") {
      const position = this.positions.find(
        p => p.positionSide === "LONG"
      );
      if (position) {
        position.exitPrice = exitPrice;
        let tradeVolume = volume;
        if (position.positionAmt <= volume) {
          tradeVolume = position.positionAmt
        }
        const diffPrice = exitPrice - position.entryPrice;
        const profit = diffPrice * tradeVolume  * (1 - fee);
        // 本金
        const capital = position.entryPrice * tradeVolume * (1 - fee);

        // 收益
        this.usdtBalance.crossWalletBalance += (capital + profit);

        // 更新持仓
        position.positionAmt -= tradeVolume;

        this.positions = this.positions.filter(
          p => p.positionAmt != 0
        );
        this.trades.push({...position});
      }
    } else if (positionSide === "SHORT") {
      // 平空
      const position = this.positions.find(
        p => p.positionSide === "SHORT"
      );
      if (position) {
        position.exitPrice = exitPrice;
        let tradeVolume = volume;
        if (position.positionAmt <= volume) {
          tradeVolume = position.positionAmt
        }
        const diffPrice = position.entryPrice - exitPrice;
        const profit = diffPrice * tradeVolume * (1 - fee);
        // 本金
        const capital = position.entryPrice * tradeVolume * (1 - fee);

        // 收益
        this.usdtBalance.crossWalletBalance += (capital + profit);

        // 更新持仓
        position.positionAmt -= tradeVolume;
        this.positions = this.positions.filter(
          p => p.positionAmt != 0
        );

        this.trades.push({...position});
      }
    }
    this.updateBalance();
  }
  public destroy() {
    this.trades = [];
  }
}
