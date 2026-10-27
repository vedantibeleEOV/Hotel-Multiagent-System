import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap, AlertCircle } from 'lucide-react';
import { hotelApi } from '../../api/hotelApi';
import { useAuth } from '../../context/AuthContext';

const SUGGESTIONS = [
  'AC is not cooling',
  'There is a gas smell in the room',
  'Toilet keeps running',
  'Bathroom light flickering',
];

/**
 * Report Maintenance Issue Modal
 * Matches Kishor Sir's prototype exactly:
 * - Title "Report maintenance issue"
 * - Subtitle "Reported as {User Name}"
 * - Circular close button
 * - Room number input (e.g. 204)
 * - Problem description textarea with "Try:" pill chips
 * - Agent note with lightning bolt icon
 * - Full-width pink "#ff385c" "Report Issue" action button
 */
export default function ReportIssueModal({ isOpen, onClose, onSuccess, initialRoom = '' }) {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [eligibleRoomIds, setEligibleRoomIds] = useState(new Set());
  const [roomNumber, setRoomNumber] = useState(initialRoom ? String(initialRoom) : '');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Set initial room if passed
  useEffect(() => {
    if (initialRoom) {
      setRoomNumber(String(initialRoom));
    }
  }, [initialRoom]);

  // Lock body scroll while open and restore on close/unmount
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  // Fetch available rooms for validation
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const isHousekeeping = (user?.role || '').toUpperCase() === 'HOUSEKEEPING';

        if (isHousekeeping) {
          const [roomsRes, tasksRes] = await Promise.all([
            hotelApi.getRooms(),
            hotelApi.getTasks({ staff_id: user?.staff_id, status_group: 'open' }),
          ]);

          if (mounted) {
            const allRooms = Array.isArray(roomsRes) ? roomsRes : roomsRes.rooms || [];
            const staffTasks = Array.isArray(tasksRes) ? tasksRes : tasksRes.tasks || [];
            const assignedIds = new Set(staffTasks.map((t) => t.room_id));
            setRooms(allRooms);
            setEligibleRoomIds(assignedIds);
          }
        } else {
          const roomsRes = await hotelApi.getRooms();
          if (mounted) {
            const roomArr = Array.isArray(roomsRes) ? roomsRes : roomsRes.rooms || [];
            setRooms(roomArr);
          }
        }
      } catch (err) {
        if (mounted) {
          console.error('Failed to load rooms:', err);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [isOpen, user]);

  if (!isOpen) return null;

  const reporterName = user?.name || user?.full_name || user?.username || 'Amit Shah';
  const isHousekeeping = (user?.role || '').toUpperCase() === 'HOUSEKEEPING';

  const handleSubmit = async (e) => {
    e.preventDefault();
    const enteredRoom = roomNumber.trim();

    if (!enteredRoom) {
      setError('Enter the room number.');
      return;
    }

    // Match entered room number or id
    const matchedRoom = rooms.find(
      (r) => String(r.room_number) === enteredRoom || String(r.id) === enteredRoom
    );

    if (!matchedRoom) {
      setError(`Room ${enteredRoom} doesn’t exist at this property.`);
      return;
    }

    // Housekeeping attendants can only report for assigned rooms
    if (isHousekeeping && !eligibleRoomIds.has(matchedRoom.id)) {
      setError(`Housekeeping attendants may only report issues for assigned rooms.`);
      return;
    }

    if (!description.trim() || description.trim().length < 4) {
      setError('Tell us what’s wrong in a few words.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await hotelApi.reportMaintenanceIssue({
        room_id: matchedRoom.id,
        description: description.trim(),
      });
      setDescription('');
      setRoomNumber('');
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to report issue:', err);
      setError(err.message || 'Failed to submit maintenance issue');
    } finally {
      setSubmitting(false);
    }
  };

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.22)',
          border: '1px solid #ebebeb',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="space-y-0.5">
            <h2 className="text-xl font-semibold text-[#222222] tracking-tight">
              Report maintenance issue
            </h2>
            <p className="text-xs text-[#6a6a6a]">
              Reported as {reporterName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border border-[#dddddd] hover:bg-[#f7f7f7] bg-white flex items-center justify-center text-[#222222] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Room Number */}
          <div className="space-y-1.5">
            <label htmlFor="maint-room-input" className="block text-[13px] font-medium text-[#222222]">
              Room number
            </label>
            <input
              id="maint-room-input"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 204"
              value={roomNumber}
              onChange={(e) => {
                setRoomNumber(e.target.value.replace(/\D/g, '').slice(0, 4));
                setError(null);
              }}
              className="w-40 h-10 px-3 text-base font-semibold text-[#222222] border border-[#dddddd] rounded-lg focus:outline-none focus:border-[#222222] placeholder:text-[#929292] placeholder:font-normal"
              disabled={submitting}
              autoFocus
            />
          </div>

          {/* 2. Describe the Problem */}
          <div className="space-y-1.5">
            <label htmlFor="maint-desc-input" className="block text-[13px] font-medium text-[#222222]">
              Describe the problem
            </label>
            <textarea
              id="maint-desc-input"
              rows={5}
              placeholder="Describe the issue in your own words..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setError(null);
              }}
              className="w-full p-3 text-sm text-[#222222] border border-[#dddddd] rounded-xl focus:outline-none focus:border-[#222222] placeholder:text-[#929292] resize-y"
              disabled={submitting}
            />

            {/* Try Chips */}
            <div className="flex items-center flex-wrap gap-1.5 pt-1">
              <span className="text-[13px] text-[#6a6a6a]">Try:</span>
              {SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => {
                    setDescription(text);
                    setError(null);
                  }}
                  className="inline-flex items-center px-3 py-1 rounded-full border border-[#dddddd] bg-white hover:border-[#222222] text-xs font-medium text-[#222222] transition-colors cursor-pointer"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          {/* Agent Note with Lightning Icon */}
          <div className="flex items-center gap-1.5 text-xs text-[#6a6a6a] pt-1">
            <Zap size={14} className="text-[#6a6a6a] flex-shrink-0" />
            <span>No need to pick a category or urgency. The Maintenance Agent works that out.</span>
          </div>

          {/* Big Pink Action Button */}
          <button
            type="submit"
            disabled={submitting || loading}
            className="w-full h-12 bg-[#ff385c] hover:bg-[#e00b41] active:scale-[0.99] text-white text-base font-semibold rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? 'Reporting issue...' : 'Report Issue'}
          </button>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

