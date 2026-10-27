import React, { useState, useEffect } from 'react';
import {
  LogOut,
  Wrench,
  CheckCircle2,
  Cpu,
  BedDouble,
  Sparkles,
  ClipboardList,
  User,
  ShieldAlert,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { formatLocalTime, cleanDetailText } from './aiOpsUtils';

export default function OrchestrationSection({
  runs = [],
  loading = false,
  onOpenRoom,
}) {
  const [selectedRunId, setSelectedRunId] = useState(null);

  // Select first run by default or when runs update
  useEffect(() => {
    if (runs.length > 0) {
      if (!selectedRunId || !runs.some((r) => r.id === selectedRunId)) {
        setSelectedRunId(runs[0].id);
      }
    } else {
      setSelectedRunId(null);
    }
  }, [runs, selectedRunId]);

  const selectedRun = runs.find((r) => r.id === selectedRunId) || runs[0];

  // Helper icon for timeline step stage
  const getStepIcon = (kind) => {
    switch (kind) {
      case 'event':
        return selectedRun?.type === 'checkout' ? <LogOut size={16} /> : <Wrench size={16} />;
      case 'orch':
        return <Cpu size={16} />;
      case 'rr':
        return <BedDouble size={16} />;
      case 'hk':
        return <Sparkles size={16} />;
      case 'mt':
        return <Wrench size={16} />;
      case 'rule':
        return <ShieldAlert size={16} />;
      case 'task':
        return <ClipboardList size={16} />;
      case 'person':
        return <User size={16} />;
      default:
        return <Activity size={16} />;
    }
  };

  if (loading && runs.length === 0) {
    return (
      <div className="orch-panel animate-pulse">
        <div className="orch-panel-header">
          <div>
            <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-56 bg-gray-100 rounded" />
          </div>
        </div>
        <div className="p-8 flex items-center justify-center">
          <div className="text-xs text-gray-400 font-medium">Loading orchestration traces...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="orch-panel">
      {/* Header */}
      <div className="orch-panel-header">
        <div>
          <h2 className="orch-panel-title">Orchestration</h2>
          <p className="orch-panel-sub">How each event moves through the agents</p>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty-box">
          <Cpu size={36} strokeWidth={1.5} className="text-[#a0a0a0] mb-2" />
          <h3 className="text-sm font-bold text-[#222222]">No agent activity yet</h3>
          <p className="text-xs text-[#6a6a6a] max-w-sm">
            Simulate a checkout or report an issue to watch the agents coordinate.
          </p>
        </div>
      ) : (
        <div className="orch">
          {/* Left list of runs */}
          <div className="trlist">
            {runs.map((r) => {
              const isSelected = selectedRun && selectedRun.id === r.id;
              const isCheckout = r.type === 'checkout';

              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedRunId(r.id)}
                  className={`tri ${isSelected ? 'on' : ''}`}
                >
                  <span
                    className="nic"
                    style={{
                      background: isSelected ? '#222222' : '#f2f2f2',
                      color: isSelected ? '#ffffff' : '#222222',
                    }}
                  >
                    {isCheckout ? <LogOut size={15} /> : <Wrench size={15} />}
                  </span>

                  <span className="tri-content">
                    <span className="tri-title">{r.title}</span>
                    <span className="tri-meta">
                      Room {r.room_number} · {formatLocalTime(r.started_at)}
                    </span>
                  </span>

                  {r.status === 'critical' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ffebee] text-[#c13515] border border-[#ffcdd2]">
                      Critical
                    </span>
                  ) : (
                    <CheckCircle2 size={16} className="text-[#17693f] flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Right side: details and vertical timeline */}
          <div className="orch-detail">
            {selectedRun ? (
              <>
                {/* Selected Run Title & Room Link */}
                <div className="orch-detail-head">
                  <div>
                    <h3 className="orch-detail-title">
                      {selectedRun.title} · Room {selectedRun.room_number}
                    </h3>
                    <p className="orch-detail-sub">
                      Started {formatLocalTime(selectedRun.started_at, true)} · {selectedRun.steps.length} steps
                    </p>
                  </div>

                  {onOpenRoom && (
                    <button
                      onClick={() => onOpenRoom(selectedRun.room_number)}
                      className="px-3 py-1.5 bg-white border border-[#dddddd] hover:bg-[#f7f7f7] text-[#222222] text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer active:scale-98 shadow-2xs"
                    >
                      <span>Open room</span>
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>

                {/* Timeline Flow */}
                <div className="flow">
                  {selectedRun.steps.map((st, idx) => {
                    const isLast = idx === selectedRun.steps.length - 1;
                    const isCriticalStep = st.kind === 'rule' || (st.detail && /CRITICAL/i.test(st.detail));

                    return (
                      <div key={`${st.kind}-${idx}`} className="fnode">
                        {/* Rail: dot & vertical line */}
                        <div className="frail">
                          <span className={`fdot ${isCriticalStep ? 'critical' : ''}`}>
                            {getStepIcon(st.kind)}
                          </span>
                          {!isLast && <span className="fline" />}
                        </div>

                        {/* Content */}
                        <div className="fcont">
                          <span className="flabel2">{st.label}</span>
                          <span className={`fstep-title ${isCriticalStep ? 'critical' : ''}`}>
                            {st.title}
                          </span>
                          <span className="fstep-detail">
                            {cleanDetailText(st.detail, selectedRun.room_number)}
                          </span>
                        </div>

                        {/* Time */}
                        <div className="fstep-time">
                          {formatLocalTime(st.time, true)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty-box py-16">
                <p className="text-xs text-gray-500">Select an event run on the left to inspect its flow.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
