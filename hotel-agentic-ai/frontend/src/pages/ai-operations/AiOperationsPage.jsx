import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useHotel } from '../../context/HotelContext';
import { useAiOperations } from '../../hooks/useAiOperations';
import { LogOut, Plus, AlertTriangle, RefreshCw } from 'lucide-react';

import AgentCard from './AgentCard';
import OrchestrationSection from './OrchestrationSection';
import ActivityFeed from './ActivityFeed';
import SimulateCheckoutModal from '../../components/dashboard/SimulateCheckoutModal';
import ReportIssueModal from '../maintenance/ReportIssueModal';

import '../../styles/aiOperations.css';

export default function AiOperationsPage() {
  const { user } = useAuth();
  const { setActiveTab } = useHotel();
  const {
    header,
    agents,
    runs,
    feed,
    loading,
    error,
    refreshAiOperations,
  } = useAiOperations();

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // Role permissions matching dashboard rules
  const role = user?.role?.toUpperCase();
  const canCheckout = ['MANAGER', 'SUPERVISOR'].includes(role);
  const canReport = ['MANAGER', 'SUPERVISOR', 'HOUSEKEEPING', 'MAINTENANCE'].includes(role);

  const simulateRoom = header?.simulate_checkout_room;
  const simulateLabel = simulateRoom
    ? `Simulate checkout · Room ${simulateRoom.room_number}`
    : 'Simulate checkout';

  const handleOpenRoom = (roomNumber) => {
    if (setActiveTab) {
      setActiveTab('rooms');
    }
  };

  return (
    <div className="aiops-container animate-fade-in">
      {/* 1. Header */}
      <div className="aiops-header">
        <div>
          <h1 className="aiops-title">{header?.title || 'AI Operations'}</h1>
          <p className="aiops-subtitle">
            {header?.subtitle || '4 agents operating normally. Humans supervise and step in on exceptions.'}
          </p>
        </div>

        <div className="aiops-actions">
          {/* Outlined Simulate checkout button */}
          {canCheckout && (
            <button
              onClick={() => setCheckoutModalOpen(true)}
              className="px-4 py-2 bg-white border border-[#dddddd] hover:bg-[#f7f7f7] text-[#222222] text-xs font-semibold rounded-xl transition-all flex items-center gap-2 shadow-2xs cursor-pointer active:scale-98"
            >
              <LogOut size={15} />
              <span>{simulateLabel}</span>
            </button>
          )}

          {/* Pink Report issue button */}
          {canReport && (
            <button
              onClick={() => setReportModalOpen(true)}
              className="px-4 py-2 bg-[#ff385c] hover:bg-[#e00b41] text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-98"
            >
              <Plus size={16} strokeWidth={2.5} />
              <span>Report issue</span>
            </button>
          )}
        </div>
      </div>

      {/* Error banner if network fails */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={refreshAiOperations}
            className="ml-auto underline font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. 4 Agent Cards Grid */}
      <div className="agrid">
        {loading && agents.length === 0 ? (
          [1, 2, 3, 4].map((i) => (
            <div key={i} className="agent-card animate-pulse">
              <div className="h-4 w-28 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-48 bg-gray-100 rounded mb-4" />
              <div className="h-6 w-16 bg-gray-200 rounded-full mb-4" />
              <div className="space-y-2">
                <div className="h-3 w-32 bg-gray-100 rounded" />
                <div className="h-3 w-40 bg-gray-100 rounded" />
              </div>
            </div>
          ))
        ) : (
          agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))
        )}
      </div>

      {/* 3. Orchestration Section */}
      <OrchestrationSection
        runs={runs}
        loading={loading}
        onOpenRoom={handleOpenRoom}
      />

      {/* 4. Agent Activity Feed Section */}
      <ActivityFeed
        feed={feed}
        loading={loading}
      />

      {/* Simulate Checkout Modal */}
      {checkoutModalOpen && (
        <SimulateCheckoutModal
          isOpen={checkoutModalOpen}
          onClose={() => setCheckoutModalOpen(false)}
          occupiedRooms={simulateRoom ? [simulateRoom] : []}
          onSuccess={refreshAiOperations}
        />
      )}

      {/* Report Maintenance Issue Modal */}
      {reportModalOpen && (
        <ReportIssueModal
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          onSuccess={refreshAiOperations}
        />
      )}
    </div>
  );
}
