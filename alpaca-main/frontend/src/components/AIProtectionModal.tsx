import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, TrendingUp, Zap, Target, Lock, ArrowUpRight, Sliders, CheckCircle2 } from 'lucide-react';
import { Position } from '../types';
import { getApiUrl } from '../config';

interface AIProtectionModalProps {
  position: Position | null;
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void;
}

export const AIProtectionModal: React.FC<AIProtectionModalProps> = ({
  position,
  isOpen,
  onClose,
  onApplied
}) => {
  if (!isOpen || !position) return null;

  const [riskReward, setRiskReward] = useState<number>(2.4);
  const [atrMultiplier, setAtrMultiplier] = useState<number>(1.8);
  const [stopLoss, setStopLoss] = useState<number>(position.stop_loss_price || position.entry_price * 0.95);
  const [takeProfit, setTakeProfit] = useState<number>(position.take_profit_price || position.entry_price * 1.12);
  const [loading, setLoading] = useState<boolean>(false);
  const [appliedSuccess, setAppliedSuccess] = useState<boolean>(false);

  const ai = position.ai_protection;
  const isProfitable = (position.unrealized_pnl || 0) >= 0;

  // Initialize values from position AI protection if available
  useEffect(() => {
    if (position) {
      if (position.stop_loss_price) setStopLoss(position.stop_loss_price);
      if (position.take_profit_price) setTakeProfit(position.take_profit_price);
      if (position.ai_protection?.risk_reward_ratio) setRiskReward(position.ai_protection.risk_reward_ratio);
      setAppliedSuccess(false);
    }
  }, [position]);

  const handleRecalculate = () => {
    const entry = position.entry_price;
    const atr = ai?.atr || (entry * 0.02);
    const stopDist = atr * atrMultiplier;

    const newSL = Math.max(entry * 0.90, round(entry - stopDist, 2));
    const riskPerShare = entry - newSL;
    const newTP = round(entry + (riskPerShare * riskReward), 2);

    setStopLoss(newSL);
    setTakeProfit(newTP);
  };

  const round = (val: number, dec: number) => Number(val.toFixed(dec));

  const handleApply = async () => {
    setLoading(true);
    try {
      const res = await fetch(getApiUrl(`/protection/position/${position.symbol}/apply`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stop_loss_price: stopLoss,
          take_profit_price: takeProfit,
          risk_reward_ratio: riskReward,
          atr_multiplier: atrMultiplier
        })
      });

      if (res.ok) {
        setAppliedSuccess(true);
        setTimeout(() => {
          if (onApplied) onApplied();
          onClose();
        }, 1200);
      }
    } catch (e) {
      console.error('Error applying AI protection:', e);
    } finally {
      setLoading(false);
    }
  };

  const currentStage = ai?.trailing_stage || 'INITIAL';
  const profitLocked = ai?.profit_locked_amount || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-black/95 border border-emerald-500/40 rounded-2xl shadow-2xl shadow-emerald-500/10 p-6 space-y-6 font-mono text-slate-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-500/20 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>AI Risk Protection & Dynamic Trailing</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/40">
                  {position.symbol}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                ATR-based volatility prediction, dynamic support/resistance & profit ratchet
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Position Summary Card */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-emerald-950/30 p-3.5 rounded-xl border border-emerald-500/20 text-xs">
          <div>
            <span className="text-slate-400 block text-[10px] font-bold">ENTRY PRICE</span>
            <span className="text-white font-extrabold text-sm">${position.entry_price.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] font-bold">CURRENT PRICE</span>
            <span className="text-white font-extrabold text-sm">${position.current_price.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] font-bold">UNREALIZED P&L</span>
            <span className={`font-extrabold text-sm ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isProfitable ? '+' : ''}${position.unrealized_pnl.toFixed(2)} ({(position.unrealized_pnl_pct * 100).toFixed(2)}%)
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] font-bold">POSITION SIZE</span>
            <span className="text-white font-extrabold text-sm">{position.qty} {position.symbol}</span>
          </div>
        </div>

        {/* Dynamic Trailing Stages Progress Bar */}
        <div className="space-y-2 bg-black/60 p-4 rounded-xl border border-emerald-500/20">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>DYNAMIC TRAILING LIFECYCLE</span>
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {currentStage.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold pt-2">
            <div className={`p-2 rounded border ${currentStage === 'INITIAL' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-black/40 border-slate-800 text-slate-500'}`}>
              1. RISK BUFFER
              <span className="block text-[9px] font-normal opacity-80">-1.8x ATR</span>
            </div>
            <div className={`p-2 rounded border ${currentStage === 'BREAK_EVEN_LOCKED' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500' : 'bg-black/40 border-slate-800 text-slate-400'}`}>
              2. BREAK-EVEN
              <span className="block text-[9px] font-normal opacity-80">+1.2% profit lock</span>
            </div>
            <div className={`p-2 rounded border ${currentStage === 'PROFIT_TRAILED' ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300 ring-2 ring-emerald-400' : 'bg-black/40 border-slate-800 text-slate-400'}`}>
              3. PROFIT RATCHET
              <span className="block text-[9px] font-normal opacity-80">Lock 65%+ gains</span>
            </div>
            <div className={`p-2 rounded border ${currentStage === 'RUNNER_MODE' ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300 ring-2 ring-cyan-400' : 'bg-black/40 border-slate-800 text-slate-500'}`}>
              4. RUNNER MODE
              <span className="block text-[9px] font-normal opacity-80">Expand TP + trail</span>
            </div>
          </div>

          {profitLocked > 0 && (
            <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-300 flex items-center justify-between font-bold">
              <span>PROFIT SECURED & LOCKED IN:</span>
              <span className="text-sm font-extrabold text-white">+${profitLocked.toFixed(2)} USD</span>
            </div>
          )}
        </div>

        {/* Technical AI Volatility Rationale */}
        <div className="bg-black/60 p-4 rounded-xl border border-emerald-500/20 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b border-emerald-500/10 pb-2">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>QUANTITATIVE METRICS</span>
            </span>
            <span className="text-slate-400 text-[11px]">
              Market Regime: <strong className="text-emerald-400">{ai?.regime || 'BULLISH'}</strong>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="bg-black/40 p-2 rounded border border-emerald-500/10">
              <span className="text-slate-400 block text-[10px]">14-Day ATR:</span>
              <span className="font-bold text-white text-xs">${ai?.atr?.toFixed(2) || '2.40'}</span>
            </div>
            <div className="bg-black/40 p-2 rounded border border-emerald-500/10">
              <span className="text-slate-400 block text-[10px]">Swing Support:</span>
              <span className="font-bold text-amber-300 text-xs">${ai?.support_level?.toFixed(2) || 'N/A'}</span>
            </div>
            <div className="bg-black/40 p-2 rounded border border-emerald-500/10">
              <span className="text-slate-400 block text-[10px]">Swing Resistance:</span>
              <span className="font-bold text-emerald-300 text-xs">${ai?.resistance_level?.toFixed(2) || 'N/A'}</span>
            </div>
          </div>

          {ai?.rationale && (
            <p className="text-[11px] text-slate-300 bg-emerald-950/40 p-2 rounded border border-emerald-500/20 leading-relaxed">
              {ai.rationale}
            </p>
          )}
        </div>

        {/* Interactive Sliders & Target Price Overrides */}
        <div className="space-y-4 bg-black/60 p-4 rounded-xl border border-emerald-500/20">
          <div className="flex items-center justify-between text-xs border-b border-emerald-500/10 pb-2">
            <span className="font-bold text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>AI PREDICTION CONTROLS</span>
            </span>
            <button
              type="button"
              onClick={handleRecalculate}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-bold cursor-pointer"
            >
              Recalculate
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Risk-to-Reward Ratio:</span>
                <span className="font-bold text-emerald-400">1 : {riskReward.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1.5"
                max="4.0"
                step="0.1"
                value={riskReward}
                onChange={(e) => {
                  setRiskReward(parseFloat(e.target.value));
                  handleRecalculate();
                }}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">ATR Volatility Multiplier:</span>
                <span className="font-bold text-amber-400">{atrMultiplier.toFixed(1)}x ATR</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.1"
                value={atrMultiplier}
                onChange={(e) => {
                  setAtrMultiplier(parseFloat(e.target.value));
                  handleRecalculate();
                }}
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[11px] text-amber-300 font-bold block mb-1">
                AI STOP LOSS LEVEL ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={stopLoss}
                onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-black/80 border border-amber-500/40 rounded-lg text-white font-bold text-sm focus:border-amber-400 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                Distance: {(((stopLoss - position.entry_price) / position.entry_price) * 100).toFixed(2)}% from entry
              </span>
            </div>

            <div>
              <label className="text-[11px] text-emerald-300 font-bold block mb-1">
                AI TAKE PROFIT LEVEL ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={takeProfit}
                onChange={(e) => setTakeProfit(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-black/80 border border-emerald-500/40 rounded-lg text-white font-bold text-sm focus:border-emerald-400 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                Target: {(((takeProfit - position.entry_price) / position.entry_price) * 100).toFixed(2)}% gain from entry
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-emerald-500/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading || appliedSuccess}
            onClick={handleApply}
            className={`px-5 py-2.5 rounded-lg text-xs font-extrabold uppercase transition-all flex items-center gap-2 cursor-pointer shadow-lg ${
              appliedSuccess
                ? 'bg-emerald-400 text-black shadow-emerald-400/30'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
            }`}
          >
            {appliedSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-black" />
                <span>PROTECTION ACTIVATED & TRAILING!</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4 text-black" />
                <span>APPLY & ENGAGE AUTO-TRAIL</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
