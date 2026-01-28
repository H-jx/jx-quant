#pragma once

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ===== Basic types =====

typedef struct HQuant HQuant;
typedef struct FuturesBacktest FuturesBacktest;

typedef struct Bar {
  int64_t timestamp;
  double open;
  double high;
  double low;
  double close;
  double volume;
  double buy_volume;
} Bar;

typedef enum Action {
  ACTION_BUY = 1,
  ACTION_SELL = 2,
  ACTION_HOLD = 3,
} Action;

typedef struct Signal {
  uint32_t strategy_id;
  Action action;
  int64_t timestamp;
} Signal;

typedef enum IndicatorValueKind {
  INDICATOR_SCALAR = 1,
  INDICATOR_TRIPLE = 2,
} IndicatorValueKind;

typedef struct IndicatorValue {
  IndicatorValueKind kind;
  double a;
  double b;
  double c;
} IndicatorValue;

typedef struct HqColumnF64 {
  const double* ptr;
  size_t capacity;
  size_t len;
  size_t head;
} HqColumnF64;

typedef struct HqColumnI64 {
  const int64_t* ptr;
  size_t capacity;
  size_t len;
  size_t head;
} HqColumnI64;

// ===== HQuant =====

HQuant* hquant_new(size_t capacity);
void hquant_free(HQuant* ptr);

uint32_t hquant_add_rsi(HQuant* ptr, size_t period);
uint32_t hquant_add_ema_close(HQuant* ptr, size_t period);
uint32_t hquant_add_sma_close(HQuant* ptr, size_t period);
uint32_t hquant_add_stddev_close(HQuant* ptr, size_t period);
uint32_t hquant_add_boll(HQuant* ptr, size_t period, double k);
uint32_t hquant_add_macd(HQuant* ptr, size_t fast, size_t slow, size_t signal);

uint32_t hquant_add_strategy(
  HQuant* ptr,
  const uint8_t* name_utf8,
  size_t name_len,
  const uint8_t* dsl_utf8,
  size_t dsl_len
);

void hquant_push_bar(HQuant* ptr, Bar bar);
void hquant_update_last_bar(HQuant* ptr, Bar bar);

size_t hquant_len(HQuant* ptr);
size_t hquant_capacity(HQuant* ptr);

HqColumnF64 hquant_close_column(HQuant* ptr);
HqColumnF64 hquant_open_column(HQuant* ptr);
HqColumnF64 hquant_high_column(HQuant* ptr);
HqColumnF64 hquant_low_column(HQuant* ptr);
HqColumnF64 hquant_volume_column(HQuant* ptr);
HqColumnF64 hquant_buy_volume_column(HQuant* ptr);
HqColumnI64 hquant_timestamp_column(HQuant* ptr);

IndicatorValue hquant_indicator_last(HQuant* ptr, uint32_t id);

size_t hquant_signals_len(HQuant* ptr);
size_t hquant_poll_signals(HQuant* ptr, Signal* out, size_t cap);

// ===== Backtest =====

typedef struct BacktestParams {
  double initial_margin;
  double leverage;
  double contract_size;
  double maker_fee_rate;
  double taker_fee_rate;
  double maintenance_margin_rate;
} BacktestParams;

typedef struct BacktestResult {
  double equity;
  double profit;
  double profit_rate;
  double max_drawdown_rate;
  uint8_t liquidated;
} BacktestResult;

FuturesBacktest* hq_backtest_new(BacktestParams params);
void hq_backtest_free(FuturesBacktest* ptr);
void hq_backtest_apply_signal(FuturesBacktest* ptr, Action action, double price, double margin);
void hq_backtest_on_price(FuturesBacktest* ptr, double price);
BacktestResult hq_backtest_result(FuturesBacktest* ptr, double price);

#ifdef __cplusplus
} // extern "C"
#endif

