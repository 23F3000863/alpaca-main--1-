import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
import numpy as np

from app.alpaca.market_data import market_data_service
from app.alpaca.utils import normalize_symbol

logger = logging.getLogger("protection_agent")

class AIProtectionAgent:
    """
    AI Protection & Adaptive Trailing Engine.
    1. Predicts optimal Stop Loss and Take Profit using:
       - 14-period Average True Range (ATR)
       - Swing Low Support & Swing High Resistance
       - Market Regime adjustments (Bullish / Bearish / Sideways / High Volatility)
       - Dynamic 1:2 to 1:2.5 Risk-to-Reward ratio
    2. Dynamic Profit Trailing:
       - Tracks peak price achieved while in trade.
       - Stage 1: Initial Risk Buffer (Entry - k * ATR)
       - Stage 2: Break-Even Lock when unrealized profit >= +1.2% (or 1x ATR gain)
       - Stage 3: Profit Ratchet Trailing when profit >= +3.0%, locking in 60-75% of peak gains.
       - Strictly upward monotonic ratcheting (never widens the stop for LONG positions).
    """

    def __init__(self):
        # Per-symbol state:
        # {
        #   "symbol": str,
        #   "entry_price": float,
        #   "current_price": float,
        #   "peak_price": float,
        #   "stop_loss_price": float,
        #   "take_profit_price": float,
        #   "initial_stop_loss": float,
        #   "initial_take_profit": float,
        #   "trailing_stage": str, # "INITIAL", "BREAK_EVEN_LOCKED", "PROFIT_TRAILED", "RUNNER_MODE"
        #   "profit_locked_amount": float,
        #   "profit_locked_pct": float,
        #   "atr": float,
        #   "risk_reward_ratio": float,
        #   "support_level": float,
        #   "resistance_level": float,
        #   "rationale": str,
        #   "last_updated": str,
        #   "auto_trail_enabled": bool
        # }
        self.protection_states: Dict[str, Dict[str, Any]] = {}
        self.auto_trail_active: bool = True

    def _compute_atr_and_levels(self, symbol: str, limit: int = 40) -> Dict[str, float]:
        """
        Calculates 14-period ATR and recent 20-period swing high/low levels.
        """
        try:
            df = market_data_service.get_historical_bars(symbol, timeframe="1D", limit=limit)
        except Exception:
            df = None
        
        try:
            quote = market_data_service.get_latest_quote(symbol)
            curr_price = float(quote.get("last_price", 100.0))
        except Exception:
            curr_price = 100.0

        if df is None or df.empty or len(df) < 10:
            # Fallback estimation based on typical volatility
            default_vol_pct = 0.025 if "BTC" in symbol.upper() else 0.018
            atr_est = round(curr_price * default_vol_pct, 2)
            return {
                "atr": atr_est,
                "current_price": curr_price,
                "support_level": round(curr_price * 0.95, 2),
                "resistance_level": round(curr_price * 1.08, 2),
                "data_points": 0
            }

        highs = df["high"].values if "high" in df.columns else df["close"].values * 1.01
        lows = df["low"].values if "low" in df.columns else df["close"].values * 0.99
        closes = df["close"].values

        # True Range calculation
        tr_list = []
        for i in range(1, len(closes)):
            h = highs[i]
            l = lows[i]
            prev_c = closes[i - 1]
            tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
            tr_list.append(tr)

        if tr_list:
            period = min(14, len(tr_list))
            atr = float(np.mean(tr_list[-period:]))
        else:
            atr = curr_price * 0.02

        # 20-period swing support & resistance
        support_window = min(20, len(lows))
        support_level = float(np.min(lows[-support_window:]))
        resistance_level = float(np.max(highs[-support_window:]))

        return {
            "atr": max(0.01, round(atr, 2)),
            "current_price": curr_price,
            "support_level": round(support_level, 2),
            "resistance_level": round(resistance_level, 2),
            "data_points": len(closes)
        }

    def predict_protection(
        self,
        position: Dict[str, Any],
        market_regime: Optional[Dict[str, Any]] = None,
        risk_reward_ratio: float = 2.4,
        atr_multiplier: float = 1.8
    ) -> Dict[str, Any]:
        """
        Predicts AI Stop Loss, Take Profit, and dynamic trailing configuration for a position.
        """
        raw_symbol = position.get("symbol", "")
        symbol = normalize_symbol(raw_symbol)
        side = position.get("side", "long").lower()
        entry_price = float(position.get("entry_price") or position.get("current_price", 100.0))
        current_price = float(position.get("current_price") or entry_price)
        qty = float(position.get("qty", 1.0))
        unrealized_pnl = float(position.get("unrealized_pnl", 0.0))
        unrealized_pnl_pct = float(position.get("unrealized_pnl_pct", 0.0))

        regime_name = (market_regime.get("regime") if market_regime else "BULLISH").upper()
        
        # Calculate technical volatility & levels
        tech = self._compute_atr_and_levels(symbol)
        atr = tech["atr"]
        support = tech["support_level"]
        resistance = tech["resistance_level"]

        # Regime-based risk calibration
        regime_adjust = 1.0
        if regime_name == "HIGH_VOLATILITY":
            regime_adjust = 1.25 # Wider stop to prevent whipsaw
            risk_reward_ratio = max(2.5, risk_reward_ratio)
        elif regime_name == "LOW_VOLATILITY":
            regime_adjust = 0.85 # Tighter stop
        elif regime_name == "BEARISH":
            regime_adjust = 0.90 # Tighter stop for long

        effective_atr_mult = atr_multiplier * regime_adjust
        stop_distance = max(atr * effective_atr_mult, entry_price * 0.015)

        if side == "long" or side == "buy":
            # Initial baseline Stop Loss
            initial_stop_loss = round(entry_price - stop_distance, 2)
            # Ensure stop loss is not below major swing support if support is close
            if 0 < (entry_price - support) <= stop_distance * 1.3:
                initial_stop_loss = round(support * 0.995, 2)

            # Prevent stop loss from being <= 0 or excessively wide (> 8% on BTC, 5% on equities)
            max_risk_pct = 0.08 if "BTC" in symbol else 0.05
            min_allowed_sl = round(entry_price * (1 - max_risk_pct), 2)
            initial_stop_loss = max(initial_stop_loss, min_allowed_sl)

            # Risk per share
            risk_per_share = max(0.01, entry_price - initial_stop_loss)
            reward_target = risk_per_share * risk_reward_ratio

            # Take Profit
            initial_take_profit = round(entry_price + reward_target, 2)
            # Align with resistance if reasonable
            if resistance > entry_price and resistance > initial_take_profit * 0.9:
                initial_take_profit = max(initial_take_profit, round(resistance * 1.01, 2))

            # Dynamic Profit Trailing Logic
            peak_price = max(entry_price, current_price)
            existing_state = self.protection_states.get(symbol)
            if existing_state:
                peak_price = max(peak_price, float(existing_state.get("peak_price", peak_price)))

            # Evaluate Trailing Stage
            trailing_stage = "INITIAL"
            current_stop_loss = initial_stop_loss
            profit_locked_amount = 0.0
            profit_locked_pct = 0.0

            # Break-even threshold: +1.2% profit or +1R
            break_even_pct = 0.012
            break_even_price = round(entry_price * 1.002, 2) # Entry + small buffer

            if unrealized_pnl_pct >= break_even_pct or current_price >= entry_price * (1 + break_even_pct):
                trailing_stage = "BREAK_EVEN_LOCKED"
                current_stop_loss = max(current_stop_loss, break_even_price)
                profit_locked_amount = round((break_even_price - entry_price) * qty, 2)
                profit_locked_pct = round((break_even_price - entry_price) / entry_price, 4)

            # Profit Ratchet Trailing threshold: +3.0% or higher
            if unrealized_pnl_pct >= 0.03 or current_price >= entry_price * 1.03:
                trailing_stage = "PROFIT_TRAILED"
                # Trail at 1.5x ATR below peak price
                atr_trailing_sl = round(peak_price - (atr * 1.5), 2)
                # Also ensure we lock in at least 60% of peak unrealized gains
                peak_gain_per_share = peak_price - entry_price
                min_lock_sl = round(entry_price + (peak_gain_per_share * 0.60), 2)

                proposed_trailed_sl = max(atr_trailing_sl, min_lock_sl)
                # Enforce strictly monotonic upward movement
                current_stop_loss = max(current_stop_loss, proposed_trailed_sl)

                profit_locked_amount = max(0.0, round((current_stop_loss - entry_price) * qty, 2))
                profit_locked_pct = max(0.0, round((current_stop_loss - entry_price) / entry_price, 4))

            # Runner Mode: If price is within 1.5% of Take Profit and momentum is high
            if current_price >= initial_take_profit * 0.985:
                trailing_stage = "RUNNER_MODE"
                # Expand Take Profit target higher
                initial_take_profit = round(initial_take_profit + (atr * 1.5), 2)
                # Tighten trailing stop to lock in 75% of profit
                runner_sl = round(entry_price + ((peak_price - entry_price) * 0.75), 2)
                current_stop_loss = max(current_stop_loss, runner_sl)
                profit_locked_amount = max(0.0, round((current_stop_loss - entry_price) * qty, 2))
                profit_locked_pct = max(0.0, round((current_stop_loss - entry_price) / entry_price, 4))

            # If existing state had an already higher trailed stop loss, never degrade it
            if existing_state and existing_state.get("stop_loss_price"):
                current_stop_loss = max(current_stop_loss, float(existing_state["stop_loss_price"]))
                profit_locked_amount = max(profit_locked_amount, float(existing_state.get("profit_locked_amount", 0.0)))
                profit_locked_pct = max(profit_locked_pct, float(existing_state.get("profit_locked_pct", 0.0)))

            rationale = (
                f"AI Protection [{regime_name} Regime]: ATR(14)=${atr:.2f}. "
                f"Stop Loss set at ${current_stop_loss:.2f} ({((current_stop_loss - entry_price) / entry_price):+.2%}). "
                f"Take Profit set at ${initial_take_profit:.2f} (Reward/Risk {risk_reward_ratio}:1). "
                f"Trailing Stage: {trailing_stage} (Locked: ${profit_locked_amount:.2f})."
            )

            prediction = {
                "symbol": symbol,
                "side": side,
                "qty": qty,
                "entry_price": entry_price,
                "current_price": current_price,
                "peak_price": peak_price,
                "stop_loss_price": current_stop_loss,
                "take_profit_price": initial_take_profit,
                "initial_stop_loss": initial_stop_loss,
                "initial_take_profit": initial_take_profit,
                "risk_distance_pct": round(abs((entry_price - initial_stop_loss) / entry_price) * 100, 2),
                "target_gain_pct": round(((initial_take_profit - entry_price) / entry_price) * 100, 2),
                "risk_reward_ratio": risk_reward_ratio,
                "atr": atr,
                "support_level": support,
                "resistance_level": resistance,
                "trailing_stage": trailing_stage,
                "profit_locked_amount": profit_locked_amount,
                "profit_locked_pct": profit_locked_pct,
                "regime": regime_name,
                "rationale": rationale,
                "auto_trail_enabled": True,
                "last_updated": datetime.now(timezone.utc).isoformat()
            }

            return prediction

        else:
            # Short position protection
            initial_stop_loss = round(entry_price + stop_distance, 2)
            initial_take_profit = round(entry_price - (stop_distance * risk_reward_ratio), 2)
            return {
                "symbol": symbol,
                "side": side,
                "qty": qty,
                "entry_price": entry_price,
                "current_price": current_price,
                "peak_price": entry_price,
                "stop_loss_price": initial_stop_loss,
                "take_profit_price": initial_take_profit,
                "initial_stop_loss": initial_stop_loss,
                "initial_take_profit": initial_take_profit,
                "risk_distance_pct": round(abs((initial_stop_loss - entry_price) / entry_price) * 100, 2),
                "target_gain_pct": round(((entry_price - initial_take_profit) / entry_price) * 100, 2),
                "risk_reward_ratio": risk_reward_ratio,
                "atr": atr,
                "support_level": support,
                "resistance_level": resistance,
                "trailing_stage": "INITIAL",
                "profit_locked_amount": 0.0,
                "profit_locked_pct": 0.0,
                "regime": regime_name,
                "rationale": f"Short protection for {symbol}.",
                "auto_trail_enabled": True,
                "last_updated": datetime.now(timezone.utc).isoformat()
            }

    def apply_prediction(self, prediction: Dict[str, Any]) -> Dict[str, Any]:
        """
        Saves and activates the prediction in live engine state.
        """
        symbol = prediction["symbol"]
        self.protection_states[symbol] = prediction
        logger.info(
            f"AI Protection Activated for {symbol}: "
            f"SL=${prediction['stop_loss_price']:.2f}, "
            f"TP=${prediction['take_profit_price']:.2f}, "
            f"Stage={prediction['trailing_stage']}"
        )
        return prediction

    def predict_and_apply_all(
        self,
        positions: List[Dict[str, Any]],
        market_regime: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Predicts and activates protection for all open positions.
        """
        results = []
        for pos in positions:
            pred = self.predict_protection(pos, market_regime)
            self.apply_prediction(pred)
            results.append(pred)
        return results

    def monitor_and_trail_positions(
        self,
        positions: List[Dict[str, Any]],
        market_regime: Optional[Dict[str, Any]] = None,
        event_callback: Optional[Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Evaluates active positions against live prices.
        Ratchets the trailing stop loss upward if price has advanced and gains increased.
        Emits notification event when a stop is ratcheted up.
        """
        if not self.auto_trail_active:
            return []

        updates = []
        for pos in positions:
            raw_sym = pos.get("symbol", "")
            symbol = normalize_symbol(raw_sym)
            state = self.protection_states.get(symbol)

            # Auto-initialize if not yet protected
            if not state:
                state = self.predict_protection(pos, market_regime)
                self.apply_prediction(state)

            old_sl = float(state.get("stop_loss_price", 0.0))
            old_stage = state.get("trailing_stage", "INITIAL")
            current_price = float(pos.get("current_price", state.get("current_price", 100.0)))
            entry_price = float(pos.get("entry_price", state.get("entry_price", current_price)))
            qty = float(pos.get("qty", state.get("qty", 1.0)))

            # Re-run prediction with updated current price
            updated_pos = dict(pos)
            updated_pos["current_price"] = current_price
            new_pred = self.predict_protection(updated_pos, market_regime)

            new_sl = float(new_pred["stop_loss_price"])
            new_stage = new_pred["trailing_stage"]

            # Check if stop loss was ratcheted upward (or stage upgraded)
            if new_sl > old_sl or new_stage != old_stage:
                self.apply_prediction(new_pred)
                pnl_locked = new_pred.get("profit_locked_amount", 0.0)

                msg = (
                    f"AI Trailing Engine: {symbol} price reached ${current_price:.2f}. "
                    f"Ratcheted Stop Loss from ${old_sl:.2f} -> ${new_sl:.2f} "
                    f"(Stage: {new_stage}, Locked: +${pnl_locked:.2f})."
                )
                logger.info(msg)

                if event_callback:
                    event_callback(
                        agent="AI Trailing Engine",
                        action="RATCHET_TRAILING_STOP",
                        details=msg,
                        symbol=symbol
                    )

                updates.append(new_pred)

        return updates

    def get_protection_state(self, symbol: str) -> Optional[Dict[str, Any]]:
        norm = normalize_symbol(symbol)
        return self.protection_states.get(norm)

    def get_all_states(self) -> Dict[str, Dict[str, Any]]:
        return self.protection_states

protection_agent = AIProtectionAgent()
