import React, { useState, useMemo } from 'react';
import { formatLocalTime, cleanDetailText } from './aiOpsUtils';

const FILTER_TABS = [
  'All',
  'Orchestrator',
  'Room Readiness',
  'Housekeeping',
  'Maintenance',
];

export default function ActivityFeed({ feed = [], loading = false }) {
  const [selectedTab, setSelectedTab] = useState('All');

  const filteredFeed = useMemo(() => {
    if (!Array.isArray(feed)) return [];
    const list = selectedTab === 'All'
      ? feed
      : feed.filter((item) => (item.agent || '').toLowerCase() === selectedTab.toLowerCase());
    return list.slice(0, 50);
  }, [feed, selectedTab]);

  const getDotColor = (severity) => {
    if (severity === 'critical') return '#c13515'; // Red for critical or safety escalation
    if (severity === 'system') return '#929292';   // Grey for system or event
    return '#222222';                             // Black for normal agent action
  };

  const getSubline = (item) => {
    const agent = item.agent || 'System';
    const room = item.room_number ? `Room ${item.room_number}` : null;
    let detail = cleanDetailText(item.detail || item.outcome || item.action || '', item.room_number);

    // If detail already starts with agent or room, strip the repetition
    if (detail.toLowerCase().startsWith(agent.toLowerCase())) {
      detail = detail.slice(agent.length).replace(/^[·•\s-]+/, '').trim();
    }
    if (room && detail.toLowerCase().startsWith(room.toLowerCase())) {
      detail = detail.slice(room.length).replace(/^[·•\s-]+/, '').trim();
    }

    const parts = [agent];
    if (room) parts.push(room);
    if (detail) parts.push(detail);

    return parts.join(' · ');
  };

  return (
    <div className="feed-panel">
      {/* Panel Header */}
      <div className="feed-panel-header">
        <div>
          <h2 className="feed-panel-title">Agent activity feed</h2>
          <p className="feed-panel-sub">Every agent and system decision, newest first</p>
        </div>

        {/* Filter Tabs Segmented Control */}
        <div className="seg" role="tablist" aria-label="Agent activity filters">
          {FILTER_TABS.map((tab) => {
            const isSelected = selectedTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={isSelected ? 'on' : ''}
                onClick={() => setSelectedTab(tab)}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed Timeline Body */}
      <div className="feed-body">
        {loading && filteredFeed.length === 0 ? (
          <div className="space-y-4 py-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="h-4 w-12 bg-gray-200 rounded" />
                <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-48 bg-gray-200 rounded" />
                  <div className="h-3 w-72 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredFeed.length === 0 ? (
          <div className="empty-box">
            <p className="text-sm font-semibold text-[#222222]">No decisions yet</p>
            <p className="text-xs text-[#6a6a6a]">
              {selectedTab === 'All'
                ? 'Agent activities will appear here in real time.'
                : `No activity recorded for ${selectedTab} yet.`}
            </p>
          </div>
        ) : (
          <div className="tl">
            {filteredFeed.map((item) => {
              const timeDisplay = formatLocalTime(item.time, false) || item.time_formatted || '—';
              const dotColor = getDotColor(item.severity);
              const subline = getSubline(item);

              return (
                <div key={item.id} className="tli">
                  {/* Left: Time (HH:MM) */}
                  <div className="tlt num">{timeDisplay}</div>

                  {/* Center: Colored Dot */}
                  <div
                    className="tld"
                    style={{ backgroundColor: dotColor }}
                    title={item.severity === 'critical' ? 'Critical escalation' : item.severity === 'system' ? 'System event' : 'Agent action'}
                  />

                  {/* Right: Bold Title & Subline */}
                  <div className="col" style={{ gap: '2px', minWidth: 0 }}>
                    <div className="feed-row-title">{item.title || item.action || 'Activity'}</div>
                    <div className="feed-row-sub">{subline}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
