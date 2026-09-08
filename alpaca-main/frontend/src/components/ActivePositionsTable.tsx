import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Lock,
  CheckCircle2
} from 'lucide-react';
import { Position } from '../types';
import { AIProtectionModal } from './AIProtectionModal';
import { getApiUrl } from '../config';

interface ActivePositionsTableProps {
  positions: Position[];
  onRefresh?: () => void;
  onOpenOptimizeModal?: () => void;
}

export const ActivePositionsTable: React.FC<ActivePositionsTableProps> = ({
  positions,
  onRefresh,
  onOpenOptimizeModal
}) => {
  const [selectedPositionForModal, setSelectedPositionForModal] = useState<Position | null>(null);
  const [isProtectionModalOpen, setIsProtectionModalOpen] = useState<boolean>(false);
  const [isPredictingAll, setIsPredictingAll] = useState<boolean>(false);
  const [autoTrailActive, setAutoTrailActive] = useState<boolean>(true);
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);

  const btcPosition = positions.find(p => p.symbol.toUpperCase().includes('BTC'));
  const lastSynced = positions.length > 0 && positions[0].last_synced_at
    ? new Date(positions[0].last_synced_at).toLocaleTimeString()
    : new Date().toLocaleTimeString();

  // Check protection engine status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(getApiUrl('/protection/status'));
        if (res.ok) {
          const data = await res.json();
          if (typeof data.auto_trail_active === 'boolean') {
            setAutoTrailActive(data.auto_trail_active);
          }
        }
      } catch (e) {
        // Fallback silently
      }
    };
    fetchStatus();
  }, []);

  // Handle "AI Predict & Trail All"
  const handlePredictAndTrailAll = async () => {
    setIsPredictingAll(true);
    try {
      const res = await fetch(getApiUrl('/protection/apply-all'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ risk_reward_ratio: 2.4, atr_multiplier: 1.8 })
      });

      if (res.ok) {
        setAppliedNotification('AI Stop Loss & Profit-Ratchet Trailing applied to all positions!');
        setTimeout(() => setAppliedNotification(null), 4000);
        if (onRefresh) onRefresh();
      }
    } catch (e) {
      console.error('Error applying AI protection to all:', e);
    } finally {
      setIsPredictingAll(false);
    }
  };

  // Toggle Auto-Trail
  const handleToggleAutoTrail = async () => {
    try {
      const res = await fetch(getApiUrl('/protection/toggle-auto-trail'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !autoTrailActive })
      });
      if (res.ok) {
        const data = await res.json();
        setAutoTrailActive(data.auto_trail_active);
      }
    } catch (e) {
      console.error('Error toggling auto trail:', e);
    }
  };

  return (
    <div className="space-y-4">
      {/* Dynamic BTC/USD Adaptive Allocation Card */}
      <div className="glass-card bg-black/85 border border-emerald-500/30 rounded-xl p-4 font-mono text-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="font-extrabold text-white text-sm">BTC/USD (CRYPTO ASSET CLASS)</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
              ALLOCATION: PAUSED
            </span>
          </div>
          <span className="text-[10px] text-slate-300 font-medium">Dynamic Risk-Adjusted Multiplier: 0.0x</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-black/70 p-3 rounded-lg border border-emerald-500/20">
          <div>
            <span className="text-slate-300 block text-[10px] font-bold">CURRENT P&L:</span>
            <span className={btcPosition ? (btcPosition.unrealized_pnl >= 0 ? "text-emerald-400 font-extrabold" : "text-rose-400 font-extrabold") : "text-slate-400 font-bold"}>
              {btcPosition
                ? `${btcPosition.unrealized_pnl >= 0 ? '+' : ''}$${btcPosition.unrealized_pnl.toFixed(2)} (${(btcPosition.unrealized_pnl_pct * 100).toFixed(2)}%)`
                : 'N/A (NO OPEN BTC POSITION)'}
            </span>
          </div>
          <div>
            <span className="text-slate-300 block text-[10px] font-bold">EDGE SCORE:</span>
            <span className="text-amber-300 font-extrabold">42 / 100 (WEAK)</span>
          </div>
          <div>
            <span className="text-slate-300 block text-[10px] font-bold">REGIME / RISK:</span>
            <span className="text-white font-extrabold">BULLISH / HIGH</span>
          </div>
          <div>
            <span className="text-slate-300 block text-[10px] font-bold">PORTFOLIO WEIGHT:</span>
            <span className="text-emerald-400 font-extrabold">
              {btcPosition ? `${((btcPosition.market_value / 100000) * 100).toFixed(2)}%` : '0.00%'}
            </span>
          </div>
        </div>

        <p className="text-[11px] text-slate-200 leading-snug bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-500/30 font-medium">
          <span className="font-bold text-amber-300">Adaptive Allocator Status:</span> "Current BTC strategy has insufficient risk-adjusted edge. Existing position remains monitored by Risk Agent; no new BTC capital recommended."
        </p>
      </div>

      {/* Main Table Terminal Card */}
      <div className="glass-card p-4 sm:p-5 rounded-xl border border-emerald-500/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-emerald-500/20 pb-3 gap-3">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              Active Paper Trading Positions ({positions.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5 w-full sm:w-auto font-mono text-xs">
            {/* Auto Trail Toggle */}
            <button
              onClick={handleToggleAutoTrail}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                autoTrailActive
                  ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
              title="Click to toggle continuous autonomous profit trailing in the background"
            >
              <span className={`w-2 h-2 rounded-full ${autoTrailActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>AI AUTO-TRAIL: {autoTrailActive ? 'ON' : 'PAUSED'}</span>
            </button>

            {/* Alpaca Live Sync Indicator */}
            <div className="flex items-center space-x-2 bg-emerald-950/60 px-3 py-1.5 rounded-lg border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="font-bold text-emerald-300 text-[11px]">● ALPACA LIVE</span>
              <span className="text-slate-400 text-[10px]">|</span>
              <span className="text-slate-300 text-[10px] font-medium">{lastSynced}</span>
            </div>

            {/* AI PREDICT & TRAIL ALL BUTTON */}
            <button
              onClick={handlePredictAndTrailAll}
              disabled={isPredictingAll}
              className="px-3.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 hover:text-white rounded-lg font-mono font-bold text-xs uppercase transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 cursor-pointer disabled:opacity-50"
              title="Predict optimal Stop Loss and Take Profit and activate trailing ratchet for all positions"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
              <span>{isPredictingAll ? 'PREDICTING...' : 'AI PREDICT & TRAIL'}</span>
            </button>

            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all border border-slate-700 hover:border-emerald-500/50 cursor-pointer"
                title="Force Refresh Alpaca State"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}

            {onOpenOptimizeModal && (
              <button
                onClick={onOpenOptimizeModal}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg font-mono font-extrabold text-xs uppercase transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-black fill-black" />
                <span>OPTIMIZE</span>
              </button>
            )}
          </div>
        </div>

        {/* Action Notification Banner */}
        {appliedNotification && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-mono font-bold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{appliedNotification}</span>
          </div>
        )}

        {positions.length === 0 ? (
          <div className="py-8 text-center text-slate-300 font-mono text-xs font-medium space-y-1">
            <p>No active positions in current portfolio cycle.</p>
            <p className="text-[11px] text-slate-300 font-normal">Positions are synchronized live with Alpaca Paper Trading API.</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-left font-mono text-xs min-w-[1150px]">
              <thead>
                <tr className="text-slate-300 border-b border-emerald-500/20 uppercase text-[10px] tracking-wider font-bold bg-black/40">
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3 text-right">Shares</th>
                  <th className="py-2.5 px-3 text-right">Entry Price</th>
                  <th className="py-2.5 px-3 text-right">Current</th>
                  <th className="py-2.5 px-3 text-right">Market Value</th>
                  <th className="py-2.5 px-3 text-right">Unrealized P&L</th>
                  <th className="py-2.5 px-3">Strategy</th>
                  <th className="py-2.5 px-3 text-right">AI Stop Loss</th>
                  <th className="py-2.5 px-3 text-right">AI Take Profit</th>
                  <th className="py-2.5 px-3">Trailing Status</th>
                  <th className="py-2.5 px-3 text-center">AI Tuning</th>
                  <th className="py-2.5 px-3 text-center">Data Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-500/15">
                {positions.map((pos) => {
                  const isPositive = pos.unrealized_pnl >= 0;
                  const ai = pos.ai_protection;

                  const slVal = pos.stop_loss_price;
                  const tpVal = pos.take_profit_price;

                  const stopLossText = slVal != null && slVal > 0
                    ? `$${slVal.toFixed(2)}`
                    : 'NOT SET';
                  const takeProfitText = tpVal != null && tpVal > 0
                    ? `$${tpVal.toFixed(2)}`
                    : 'NOT SET';

                  const trailingStage = ai?.trailing_stage || 'INITIAL';
                  const profitLocked = ai?.profit_locked_amount || 0;

                  return (
                    <tr key={pos.id || pos.symbol} className="hover:bg-emerald-950/40 transition-colors">
                      <td className="py-3 px-3 font-bold text-white flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <span>{pos.symbol}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase font-bold text-[10px]">
                          {pos.side}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right text-white font-extrabold">{pos.qty}</td>
                      <td className="py-3 px-3 text-right text-slate-300 font-medium">${pos.entry_price.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-bold text-white">${pos.current_price.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-bold text-white">
                        ${pos.market_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`py-3 px-3 text-right font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        <div className="flex items-center justify-end space-x-1">
                          {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          <span>
                            {isPositive ? '+' : ''}${pos.unrealized_pnl.toFixed(2)} ({(pos.unrealized_pnl_pct * 100).toFixed(2)}%)
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-emerald-300 font-semibold">{pos.strategy_id}</td>

                      {/* STOP LOSS COLUMN */}
                      <td className="py-3 px-3 text-right font-bold">
                        {stopLossText === 'NOT SET' ? (
                          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold">
                            NOT SET
                          </span>
                        ) : (
                          <div>
                            <span className={profitLocked > 0 ? "text-emerald-400 font-extrabold" : "text-amber-300 font-bold"}>
                              {stopLossText}
                            </span>
                            {profitLocked > 0 ? (
                              <span className="block text-[9px] text-emerald-300/90 font-extrabold flex items-center justify-end gap-0.5">
                                <Lock className="w-2.5 h-2.5" />
                                <span>+${profitLocked.toFixed(0)} LOCKED</span>
                              </span>
                            ) : (
                              <span className="block text-[9px] text-amber-400/80 font-medium">
                                -{(((pos.entry_price - (slVal || 0)) / pos.entry_price) * 100).toFixed(1)}% RISK
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* TAKE PROFIT COLUMN */}
                      <td className="py-3 px-3 text-right font-bold">
                        {takeProfitText === 'NOT SET' ? (
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/20 rounded text-[10px] font-bold">
                            NOT SET
                          </span>
                        ) : (
                          <div>
                            <span className="text-emerald-400 font-bold">{takeProfitText}</span>
                            <span className="block text-[9px] text-emerald-400/80 font-medium">
                              +{((((tpVal || 0) - pos.entry_price) / pos.entry_price) * 100).toFixed(1)}% TARGET
                            </span>
                          </div>
                        )}
                      </td>

                      {/* TRAILING STATUS COLUMN */}
                      <td className="py-3 px-3">
                        {trailingStage === 'PROFIT_TRAILED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 rounded-lg text-[10px] font-extrabold shadow-sm shadow-emerald-500/20">
                            <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400 animate-pulse" />
                            <span>TRAILED: {stopLossText} (+${profitLocked.toFixed(2)} LOCKED)</span>
                          </span>
                        ) : trailingStage === 'BREAK_EVEN_LOCKED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-lg text-[10px] font-bold">
                            <ShieldCheck className="w-3 h-3 text-cyan-400" />
                            <span>BREAK-EVEN LOCKED ({stopLossText})</span>
                          </span>
                        ) : trailingStage === 'RUNNER_MODE' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-[10px] font-extrabold">
                            <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span>RUNNER MODE (+${profitLocked.toFixed(2)} LOCKED)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-black/60 text-slate-300 border border-emerald-500/30 rounded text-[10px] font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>{pos.trailing_status || 'ALPHA HUNTER ATR TRAIL'}</span>
                          </span>
                        )}
                      </td>

                      {/* AI TUNING ACTION BUTTON */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedPositionForModal(pos);
                            setIsProtectionModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-emerald-950/80 text-slate-300 hover:text-emerald-300 rounded-lg border border-slate-700 hover:border-emerald-500/40 text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer mx-auto shadow-sm"
                          title="View Technical Volatility Breakdown and Tune Stop Loss / Take Profit"
                        >
                          <Sliders className="w-3 h-3 text-emerald-400" />
                          <span>AI TUNE</span>
                        </button>
                      </td>

                      {/* DATA SOURCE */}
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-bold">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>{pos.data_source || 'ALPACA LIVE'}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Protection & Trailing Modal */}
      <AIProtectionModal
        position={selectedPositionForModal}
        isOpen={isProtectionModalOpen}
        onClose={() => {
          setIsProtectionModalOpen(false);
          setSelectedPositionForModal(null);
        }}
        onApplied={() => {
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
};
