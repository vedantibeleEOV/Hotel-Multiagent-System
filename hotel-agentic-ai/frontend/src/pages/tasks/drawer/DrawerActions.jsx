import React, { useState } from 'react';
import { Play, Check, Lock, AlertTriangle } from 'lucide-react';

const BLOCK_REASONS = [
  'Guest in room / DND',
  'Waiting for parts',
  'Room not accessible',
  'Needs another trade',
];

export default function DrawerActions({
  detail,
  actionRunning,
  onStart,
  onComplete,
  onBlock,
  onEscalate,
  onCancel,
  onClose,
}) {
  const [showBlockBox, setShowBlockBox] = useState(false);
  const [selectedBlockReason, setSelectedBlockReason] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  if (!detail) return null;

  const allowed = Array.isArray(detail.allowed_actions) ? detail.allowed_actions : [];
  const isInspection =
    detail.task_type === 'ROOM_INSPECTION' ||
    detail.type_label?.toLowerCase().includes('inspection') ||
    detail.display_id?.startsWith('INSP');
  const isMaintenance =
    detail.task_type === 'MAINTENANCE_REPAIR' ||
    detail.type_label?.toLowerCase().includes('maintenance');

  const isCompleted =
    detail.status === 'COMPLETED' || detail.status === 'DONE' || detail.status === 'CANCELLED';

  const handleBlockSubmit = async () => {
    if (!selectedBlockReason) return;
    const ok = await onBlock(selectedBlockReason);
    if (ok) {
      setShowBlockBox(false);
      setSelectedBlockReason('');
    }
  };

  const handleCancelConfirm = async () => {
    const ok = await onCancel();
    if (ok) {
      setShowCancelConfirm(false);
    }
  };

  // Primary action button labels
  const startLabel = isInspection ? 'Start inspection' : (isMaintenance ? 'Start repair' : 'Start cleaning');
  const completeLabel = isInspection ? 'Pass Inspection' : (isMaintenance ? 'Mark resolved' : 'Mark clean');

  return (
    <div className="flex flex-col gap-3">
      {/* Block Reason Picker Box (shown when Block button clicked) */}
      {showBlockBox && (
        <div className="task-ovbox">
          <b className="text-sm text-[#222222]">Why is this task blocked?</b>
          <div className="flex flex-wrap gap-2">
            {BLOCK_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setSelectedBlockReason(reason)}
                className={`task-chip-btn ${selectedBlockReason === reason ? 'active' : ''}`}
              >
                {reason}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={!selectedBlockReason || actionRunning === 'block'}
              onClick={handleBlockSubmit}
              className="task-btn-primary"
            >
              {actionRunning === 'block' ? 'Blocking...' : 'Mark blocked'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowBlockBox(false);
                setSelectedBlockReason('');
              }}
              className="task-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sticky Footer Action Buttons */}
      <div className="task-drawer-foot-row">
        {isCompleted ? (
          <div className="text-xs text-[#717171] italic">
            This task is {detail.status?.toLowerCase()}.
          </div>
        ) : (
          <>
            {/* 1. Start Button */}
            {allowed.includes('start') && (
              <button
                type="button"
                disabled={Boolean(actionRunning)}
                onClick={onStart}
                className="task-btn-primary"
              >
                {actionRunning === 'start' ? (
                  <span>Starting...</span>
                ) : (
                  <>
                    <Play size={14} className="fill-white" />
                    <span>{startLabel}</span>
                  </>
                )}
              </button>
            )}

            {/* 2. Complete / Pass Inspection Button */}
            {allowed.includes('complete') && (
              <button
                type="button"
                disabled={Boolean(actionRunning)}
                onClick={async () => {
                  const ok = await onComplete();
                  if (ok && isInspection && onClose) {
                    onClose();
                  }
                }}
                className={`task-btn-primary ${isInspection ? '!bg-[#10b981] hover:!bg-[#059669] text-white border-none shadow-sm' : ''}`}
                style={isInspection ? { backgroundColor: '#10b981', color: '#ffffff', borderColor: '#059669', fontWeight: 600 } : undefined}
              >
                {actionRunning === 'complete' ? (
                  <span>{isInspection ? 'Passing inspection...' : 'Completing...'}</span>
                ) : (
                  <>
                    <Check size={16} strokeWidth={2.5} />
                    <span>{completeLabel}</span>
                  </>
                )}
              </button>
            )}

            {/* 3. Block Button */}
            {allowed.includes('block') && !showBlockBox && (
              <button
                type="button"
                disabled={Boolean(actionRunning)}
                onClick={() => setShowBlockBox(true)}
                className="task-btn-secondary"
              >
                <Lock size={14} />
                <span>Mark blocked</span>
              </button>
            )}

            {/* 4. Escalate Button */}
            {allowed.includes('escalate') && (
              <button
                type="button"
                disabled={Boolean(actionRunning)}
                onClick={() => onEscalate()}
                className="task-btn-secondary"
              >
                <AlertTriangle size={14} />
                <span>{actionRunning === 'escalate' ? 'Escalating...' : 'Escalate'}</span>
              </button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* 5. Cancel Task Link / Confirmation */}
            {allowed.includes('cancel') && (
              <div>
                {!showCancelConfirm ? (
                  <button
                    type="button"
                    disabled={Boolean(actionRunning)}
                    onClick={() => setShowCancelConfirm(true)}
                    className="task-btn-tertiary"
                  >
                    Cancel task
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#222222] font-medium">
                      Cancel {detail.display_id || 'task'}?
                    </span>
                    <button
                      type="button"
                      disabled={actionRunning === 'cancel'}
                      onClick={handleCancelConfirm}
                      className="task-btn-primary !h-7 !px-2.5 !text-xs"
                    >
                      {actionRunning === 'cancel' ? 'Cancelling...' : 'Yes, cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      className="task-btn-secondary !h-7 !px-2.5 !text-xs"
                    >
                      Keep
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
