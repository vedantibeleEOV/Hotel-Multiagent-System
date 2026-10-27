import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  LogOut,
  Plus,
  CheckCircle2,
  ListTodo,
  Zap,
  Wrench,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Star,
  Check,
} from 'lucide-react';
import { hotelApi } from '../../api/hotelApi';
import { useAuth } from '../../context/AuthContext';
import { useHotel } from '../../context/HotelContext';
import ReportIssueModal from '../maintenance/ReportIssueModal';
import CheckoutConfirmModal from './CheckoutConfirmModal';

export default function RoomDetailView({ roomNumber, onBack }) {
  const { user } = useAuth();
  const { refreshData } = useHotel();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [passingInspection, setPassingInspection] = useState(false);
  const [passError, setPassError] = useState(null);

  const role = user?.role?.toUpperCase();
  const canCheckout = ['MANAGER', 'SUPERVISOR'].includes(role);
  const canReport = ['MANAGER', 'SUPERVISOR', 'HOUSEKEEPING', 'MAINTENANCE'].includes(role);

  const fetchRoomDetails = useCallback(async () => {
    if (!roomNumber) return;
    setLoading(true);
    setError(null);
    try {
      const res = await hotelApi.getRoomDetails(roomNumber);
      setData(res);
    } catch (err) {
      console.error('Failed to load room details:', err);
      setError(err.message || 'Unable to fetch room details from server');
    } finally {
      setLoading(false);
    }
  }, [roomNumber]);

  useEffect(() => {
    fetchRoomDetails();
  }, [fetchRoomDetails]);

  // Polling every 10 seconds for real-time sync
  useEffect(() => {
    const interval = setInterval(() => {
      hotelApi.getRoomDetails(roomNumber).then(setData).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [roomNumber]);

  const handleConfirmCheckout = async () => {
    if (!data || checkoutLoading) return;
    const reservationId = data.current_guest?.reservation_id;
    if (!reservationId) {
      setCheckoutError('No active reservation ID found for checkout');
      return;
    }

    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      await hotelApi.processCheckout({
        property_id: 1,
        room_id: data.id,
        reservation_id: reservationId,
        checkout_time: new Date().toISOString(),
      });
      setCheckoutModalOpen(false);
      await Promise.allSettled([
        fetchRoomDetails(),
        refreshData ? refreshData() : Promise.resolve(),
      ]);
    } catch (err) {
      setCheckoutError(err.message || 'Checkout failed');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePassInspection = async () => {
    if (!data || passingInspection) return;
    setPassingInspection(true);
    setPassError(null);
    try {
      let taskId = data.inspection_task_id;
      if (!taskId) {
        const inspTask = (data.open_tasks || []).find(
          (t) =>
            t.task_type === 'ROOM_INSPECTION' ||
            (t.type || '').toLowerCase().includes('inspection') ||
            (t.desc || '').toLowerCase().includes('inspection')
        );
        taskId = inspTask?.id;
      }
      if (!taskId) {
        const tasksRes = await hotelApi.getTasks({ type: 'inspection', room_id: data.id });
        if (Array.isArray(tasksRes) && tasksRes.length > 0) {
          taskId = tasksRes[0].id;
        }
      }
      if (!taskId) {
        throw new Error('No pending inspection task found for this room.');
      }

      await hotelApi.completeTask(taskId);

      setData((prev) => (prev ? { ...prev, status: 'READY', formatted_status: 'Ready' } : prev));
      await Promise.allSettled([
        fetchRoomDetails(),
        refreshData ? refreshData() : Promise.resolve(),
      ]);
    } catch (err) {
      console.error('Failed to pass inspection:', err);
      setPassError(err.message || 'Failed to pass inspection');
    } finally {
      setPassingInspection(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-16 flex flex-col items-center justify-center gap-3 text-[#6a6a6a]">
        <RefreshCw size={24} className="animate-spin text-[#ff385c]" />
        <span className="text-xs font-semibold">Loading Room {roomNumber} details...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#6a6a6a] hover:text-[#222222] transition-colors cursor-pointer"
        >
          <ChevronLeft size={16} /> Rooms
        </button>
        <div className="p-8 rounded-2xl bg-white border border-[#dddddd] text-center space-y-3">
          <AlertTriangle size={24} className="text-rose-500 mx-auto" />
          <h3 className="text-base font-bold text-[#222222]">Room {roomNumber} not found</h3>
          <p className="text-xs text-[#6a6a6a]">{error}</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-[#222222] text-white text-xs font-semibold rounded-xl cursor-pointer"
          >
            Back to rooms
          </button>
        </div>
      </div>
    );
  }

  const room = data || {};
  const currentGuest = room.current_guest;
  const upcomingReservation = room.upcoming_reservation;
  const openTasks = room.open_tasks || [];
  const aiDecisions = room.ai_decisions || [];
  const housekeepingHistory = room.housekeeping_history || [];
  const maintenanceHistory = room.maintenance_history || [];
  const timeline = room.timeline || [];

  const isOccupied = room.status === 'OCCUPIED';
  const isInspection = (room.status || '').toUpperCase() === 'INSPECTION';
  const canPassInspection = ['MANAGER', 'SUPERVISOR'].includes(role) && isInspection;

  const getStatusTone = (st) => {
    switch ((st || '').toUpperCase()) {
      case 'OCCUPIED':
        return 'bg-[#222222] text-white';
      case 'READY':
        return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
      case 'INSPECTION':
        return 'bg-amber-50 text-amber-800 border border-amber-200';
      case 'CLEANING':
      case 'DIRTY':
        return 'bg-amber-50 text-amber-800 border border-amber-200';
      case 'MAINTENANCE':
        return 'bg-rose-50 text-rose-800 border border-rose-200';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPrioBadgeTone = (prio) => {
    switch ((prio || '').toUpperCase()) {
      case 'CRITICAL':
        return 'bg-rose-100 text-rose-800';
      case 'HIGH':
        return 'bg-amber-100 text-amber-800';
      case 'MEDIUM':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header with Back Button and Quick Actions */}
      <div className="space-y-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#6a6a6a] hover:text-[#222222] transition-colors cursor-pointer select-none"
        >
          <ChevronLeft size={16} /> Rooms
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#222222] tracking-tight">
                Room {room.room_number}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusTone(
                  room.status
                )}`}
              >
                {room.formatted_status || room.status}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#6a6a6a] font-medium mt-1">
              {room.room_type} · Floor {room.floor}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Quick Pass Inspection Button for Supervisors & Managers */}
            {canPassInspection && (
              <button
                type="button"
                onClick={handlePassInspection}
                disabled={passingInspection}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 !bg-[#10b981] hover:!bg-[#059669] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-98"
              >
                {passingInspection ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Check size={15} strokeWidth={2.5} />
                )}
                <span>{passingInspection ? 'Passing...' : 'Pass Inspection'}</span>
              </button>
            )}

            {/* Simulate Checkout (if occupied and allowed) */}
            {canCheckout && isOccupied && (
              <button
                onClick={() => setCheckoutModalOpen(true)}
                className="px-3.5 py-2 bg-white border border-[#dddddd] hover:bg-[#f7f7f7] text-[#222222] text-xs font-semibold rounded-xl transition-all shadow-2xs flex items-center gap-2 cursor-pointer active:scale-98"
              >
                <LogOut size={14} />
                <span>Simulate checkout</span>
              </button>
            )}

            {/* Report Issue Button */}
            {canReport && (
              <button
                onClick={() => setReportModalOpen(true)}
                className="px-3.5 py-2 bg-[#ff385c] hover:bg-[#e00b41] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-98"
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>Report issue</span>
              </button>
            )}
          </div>
        </div>

        {/* Pass Inspection Error Banner */}
        {passError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>{passError}</span>
          </div>
        )}
      </div>

      {/* 2. Main Two-Column Layout matching Kishor Sir's Prototype */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* A. Current Guest & Upcoming Reservation (2 mini cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Current Guest */}
            <div className="bg-white border border-[#dddddd] rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-[#222222]">Current guest</h3>
              <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2 text-xs">
                <span className="text-[#6a6a6a] font-medium">Guest</span>
                <span className="text-[#222222] font-semibold flex items-center gap-1.5 truncate">
                  {currentGuest ? (
                    <>
                      <span>{currentGuest.name}</span>
                      {currentGuest.vip && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-[#222222] text-white text-[10px] font-bold">
                          <Star size={9} fill="currentColor" /> VIP
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[#6a6a6a] font-normal">Vacant</span>
                  )}
                </span>

                <span className="text-[#6a6a6a] font-medium">Departure</span>
                <span className="text-[#222222] font-semibold">
                  {currentGuest ? currentGuest.departure : '—'}
                </span>
              </div>
            </div>

            {/* Upcoming Reservation */}
            <div className="bg-white border border-[#dddddd] rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-[#222222]">Upcoming reservation</h3>
              <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-2 text-xs">
                <span className="text-[#6a6a6a] font-medium">Guest</span>
                <span className="text-[#222222] font-semibold flex items-center gap-1.5 truncate">
                  {upcomingReservation ? (
                    <>
                      <span>{upcomingReservation.name}</span>
                      {upcomingReservation.vip && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-[#222222] text-white text-[10px] font-bold">
                          <Star size={9} fill="currentColor" /> VIP
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[#6a6a6a] font-normal">None today</span>
                  )}
                </span>

                <span className="text-[#6a6a6a] font-medium">Check-in</span>
                <span className="text-[#222222] font-semibold font-mono">
                  {upcomingReservation ? upcomingReservation.check_in : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* B. Open Tasks Panel */}
          <div className="bg-white border border-[#dddddd] rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#222222]">Open tasks</h3>
              {openTasks.length > 0 && (
                <span className="text-xs text-[#6a6a6a] font-medium">
                  {openTasks.length} in progress
                </span>
              )}
            </div>

            {openTasks.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-[#f2f2f2] text-[#222222] flex items-center justify-center">
                  <Check size={20} strokeWidth={2.5} />
                </div>
                <h4 className="text-sm font-bold text-[#222222]">No open tasks</h4>
                <p className="text-xs text-[#6a6a6a]">
                  This room has no cleaning or maintenance work pending.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {openTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-[#ebebeb] bg-[#fafafa] hover:bg-[#f2f2f2] transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-white border border-[#dddddd] flex items-center justify-center text-[#222222] flex-shrink-0">
                        {t.type === 'Maintenance' ? (
                          <Wrench size={16} />
                        ) : (
                          <Sparkles size={16} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#222222] truncate">
                          {t.desc || t.title}
                        </p>
                        <p className="text-[11px] text-[#6a6a6a]">
                          {t.type} · {t.assignee}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getPrioBadgeTone(
                          t.prio
                        )}`}
                      >
                        {t.prio}
                      </span>
                      <span className="text-xs font-semibold text-[#222222]">
                        {t.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* C. AI Decisions Panel */}
          <div className="bg-white border border-[#dddddd] rounded-2xl p-5 shadow-xs space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-[#222222]" />
                <h3 className="text-sm font-bold text-[#222222]">AI decisions</h3>
              </div>
              <p className="text-xs text-[#6a6a6a] mt-0.5">
                What the agents decided for this room, in plain language
              </p>
            </div>

            {aiDecisions.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#6a6a6a] font-medium">
                No AI decisions recorded today.
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {aiDecisions.map((decision) => (
                  <div
                    key={decision.id}
                    className="flex items-start gap-3 p-2.5 rounded-xl bg-[#fafafa] border border-[#ebebeb]"
                  >
                    <span className="text-[11px] font-mono text-[#6a6a6a] pt-0.5">
                      {decision.time}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-xs font-bold text-[#222222]">
                        {decision.action}
                      </p>
                      <p className="text-xs text-[#4a4a4a]">
                        <span className="font-medium text-[#222222]">{decision.actor}</span> · {decision.result}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* D. Housekeeping History & Maintenance History (2 mini cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Housekeeping History */}
            <div className="bg-white border border-[#dddddd] rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-[#222222]">Housekeeping history</h3>
              {housekeepingHistory.length === 0 ? (
                <p className="text-xs text-[#6a6a6a] py-2">No completed cleaning today.</p>
              ) : (
                <div className="space-y-2">
                  {housekeepingHistory.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-xs py-1 border-b border-[#f2f2f2] last:border-none">
                      <span className="text-[#6a6a6a] font-mono text-[11px]">{h.time}</span>
                      <span className="text-[#222222] font-medium truncate flex-1 mx-2">{h.desc || 'Cleaning'} · {h.assignee}</span>
                      <span className="text-emerald-700 font-bold text-[11px]">Completed</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Maintenance History */}
            <div className="bg-white border border-[#dddddd] rounded-2xl p-5 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-[#222222]">Maintenance history</h3>
              {maintenanceHistory.length === 0 ? (
                <p className="text-xs text-[#6a6a6a] py-2">No resolved issues today.</p>
              ) : (
                <div className="space-y-2">
                  {maintenanceHistory.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b border-[#f2f2f2] last:border-none">
                      <span className="text-[#6a6a6a] font-mono text-[11px]">{m.time}</span>
                      <span className="text-[#222222] font-medium truncate flex-1 mx-2">{m.desc}</span>
                      <span className="text-emerald-700 font-bold text-[11px]">Resolved</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Activity Timeline (1/3 width) */}
        <div className="bg-white border border-[#dddddd] rounded-2xl p-5 shadow-xs space-y-3">
          <div>
            <h3 className="text-sm font-bold text-[#222222]">Activity timeline</h3>
            <p className="text-xs text-[#6a6a6a] mt-0.5">Every event for this room</p>
          </div>

          {timeline.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-2">
              <div className="w-10 h-10 rounded-full bg-[#f2f2f2] text-[#6a6a6a] flex items-center justify-center">
                <ListTodo size={20} />
              </div>
              <h4 className="text-sm font-bold text-[#222222]">No activity yet</h4>
              <p className="text-xs text-[#6a6a6a]">
                Events for this item will appear here.
              </p>
            </div>
          ) : (
            <div className="relative pt-2">
              <div className="space-y-4">
                {timeline.map((item, idx) => {
                  const isCritical = item.severity === 'critical';
                  const isSystem = item.severity === 'system';
                  const dotColor = isCritical ? '#c13515' : isSystem ? '#929292' : '#222222';

                  return (
                    <div key={item.id} className="relative flex items-start gap-3 pl-1">
                      {/* Vertical line connecting dots */}
                      {idx !== timeline.length - 1 && (
                        <span
                          className="absolute left-[3.35rem] top-4.5 -bottom-4 w-[1px] bg-[#dddddd]"
                          aria-hidden="true"
                        />
                      )}

                      {/* Time */}
                      <span className="w-10 text-right text-[11px] font-mono text-[#6a6a6a] pt-0.5 flex-shrink-0">
                        {item.time}
                      </span>

                      {/* Dot */}
                      <span
                        className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ring-3 ring-white relative z-10"
                        style={{ backgroundColor: dotColor }}
                      />

                      {/* Content */}
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-xs font-bold text-[#222222] leading-tight">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-[#6a6a6a] leading-normal break-words">
                          {item.detail || item.action || item.result}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {reportModalOpen && (
        <ReportIssueModal
          isOpen={reportModalOpen}
          initialRoom={room.room_number}
          onClose={() => setReportModalOpen(false)}
          onSuccess={fetchRoomDetails}
        />
      )}

      {checkoutModalOpen && (
        <CheckoutConfirmModal
          room={room}
          isOpen={checkoutModalOpen}
          onClose={() => {
            if (!checkoutLoading) {
              setCheckoutModalOpen(false);
              setCheckoutError(null);
            }
          }}
          onConfirm={handleConfirmCheckout}
          loading={checkoutLoading}
          error={checkoutError}
        />
      )}
    </div>
  );
}
