import React, { useState, useEffect } from 'react';
import { formatTimeAgo, cleanDetailText } from './aiOpsUtils';

export default function AgentCard({ agent }) {
  // Live tick to update "X sec ago" every second
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!agent) return null;

  const isProcessing = agent.status === 'Processing';
  const isFallback = agent.status === 'Fallback rules';

  return (
    <div className={`agent-card ${isProcessing ? 'processing' : ''}`}>
      {/* Title & Description */}
      <div className="agent-card-header">
        <h3 className="agent-card-name">{agent.name}</h3>
        <p className="agent-card-desc">{agent.description}</p>
      </div>

      {/* Status Pill */}
      <div>
        {isFallback ? (
          <span className="agent-pill warn">
            <span className="pill-dot" style={{ background: '#d9772b' }} />
            <span>Fallback rules</span>
          </span>
        ) : isProcessing ? (
          <span className="agent-pill processing">
            <span className="pill-dot pulse" style={{ background: '#ffffff' }} />
            <span>Processing</span>
          </span>
        ) : (
          <span className="agent-pill active">
            <span className="pill-dot" style={{ background: '#17693f' }} />
            <span>Active</span>
          </span>
        )}
      </div>

      {/* Key-Value Details */}
      <div className="agent-dl">
        <span className="dl-label">Currently</span>
        <span className="dl-value">{agent.currently || 'Listening for events'}</span>

        <span className="dl-label">Last action</span>
        <span
          className="dl-value cursor-help"
          title={cleanDetailText(agent.last_action) || '—'}
        >
          {(() => {
            const fullText = cleanDetailText(agent.last_action) || '—';
            return fullText.length > 60 ? `${fullText.slice(0, 57)}...` : fullText;
          })()}
        </span>

        <span className="dl-label">Last run</span>
        <span className="dl-value num">{formatTimeAgo(agent.last_run_at)}</span>
      </div>

      {/* Bottom 3 Stats */}
      <div className="agent-stats-row">
        <div className="agent-stat-col">
          <span className="agent-stat-value">{agent.active ?? '—'}</span>
          <span className="agent-stat-label">Active</span>
        </div>
        <div className="agent-stat-col">
          <span className="agent-stat-value">{agent.processed_today ?? '—'}</span>
          <span className="agent-stat-label">Processed</span>
        </div>
        <div className="agent-stat-col">
          <span className="agent-stat-value">
            {agent.success_pct != null ? `${agent.success_pct}%` : '—'}
          </span>
          <span className="agent-stat-label">Success %</span>
        </div>
      </div>
    </div>
  );
}
