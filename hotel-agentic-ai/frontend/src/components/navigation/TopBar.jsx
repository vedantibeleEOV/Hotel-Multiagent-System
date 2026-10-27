import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useHotel } from '../../context/HotelContext';
import { useAuth } from '../../context/AuthContext';
import { hotelApi } from '../../api/hotelApi';
import {
  Building2,
  Search,
  FlaskConical,
  Bell,
  ChevronDown,
  RotateCcw,
  AlertTriangle,
  LogOut,
  User,
} from 'lucide-react';

export default function TopBar() {
  const {
    rooms,
    staff,
    tasks,
    openRoomDetail,
    openStaffDetail,
    openTaskDetail,
    simulationActive,
    setSimulationActive,
    isOnline,
    totalRooms,
    resetSystem,
    refreshData,
  } = useHotel();
  const { user, logout } = useAuth();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [forbiddenToast, setForbiddenToast] = useState(null);
  const [now, setNow] = useState(new Date());
  const userMenuRef = useRef(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSearchPopup, setShowSearchPopup] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchContainerRef = useRef(null);

  // 200 ms debounce after user types
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const role = user?.role?.toUpperCase();
  const canSimulate = role === 'MANAGER' || role === 'SUPERVISOR';
  const canResetDb = role === 'MANAGER';
  // Housekeeping and Maintenance staff only see Tasks in search
  const canViewRoomsAndStaff = role !== 'HOUSEKEEPING' && role !== 'MAINTENANCE';

  // Listen to 403 Forbidden events dispatched by API client
  useEffect(() => {
    function handleForbidden(e) {
      const msg = e.detail?.message || 'You do not have permission for this action.';
      setForbiddenToast(msg);
      setTimeout(() => setForbiddenToast(null), 5000);
    }
    window.addEventListener('voyage_forbidden', handleForbidden);
    return () => window.removeEventListener('voyage_forbidden', handleForbidden);
  }, []);

  // Close user dropdown and search popup when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
        setShowSearchPopup(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Grouped search results from rooms, staff, tasks
  const searchGroups = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    if (!q) return [];

    const groups = [];

    // 1. Rooms (Managers & Supervisors only)
    if (canViewRoomsAndStaff) {
      const roomMatches = (rooms || [])
        .filter((r) => {
          const num = String(r.room_number || r.id || '').toLowerCase();
          const type = String(r.room_type || '').toLowerCase();
          return num.includes(q) || type.includes(q);
        })
        .slice(0, 5)
        .map((r) => {
          const rNum = String(r.room_number || r.id);
          const rType = r.room_type
            ? r.room_type.charAt(0).toUpperCase() + r.room_type.slice(1).toLowerCase().replace(/_/g, ' ')
            : 'Standard';
          const rFloor = r.floor ? `Floor ${r.floor}` : null;
          const rStatus = r.status
            ? r.status.charAt(0).toUpperCase() + r.status.slice(1).toLowerCase()
            : 'Ready';
          const subtitle = [rType, rFloor, rStatus].filter(Boolean).join(' · ');

          return {
            id: `room-${rNum}`,
            group: 'Rooms',
            title: `Room ${rNum}`,
            subtitle,
            onSelect: () => {
              openRoomDetail(rNum);
              setSearchQuery('');
              setDebouncedQuery('');
              setShowSearchPopup(false);
            },
          };
        });

      if (roomMatches.length > 0) {
        groups.push({ name: 'Rooms', items: roomMatches });
      }
    }

    // 2. Staff (Managers & Supervisors only)
    if (canViewRoomsAndStaff) {
      const staffMatches = (staff || [])
        .filter((s) => {
          const name = String(s.name || '').toLowerCase();
          const sRole = String(s.role || '').toLowerCase();
          return name.includes(q) || sRole.includes(q);
        })
        .slice(0, 5)
        .map((s) => {
          const roleUpper = (s.role || '').toUpperCase();
          let roleLabel = 'Room Attendant';
          if (roleUpper === 'MAINTENANCE') roleLabel = 'Technician';
          else if (roleUpper === 'SUPERVISOR') roleLabel = 'Floor Supervisor';
          else if (roleUpper === 'MANAGER') roleLabel = 'Duty Manager';
          else if (roleUpper === 'FRONT_DESK') roleLabel = 'Front Desk';
          else if (s.id === 201) roleLabel = 'Senior Attendant';

          const availRaw = (s.availability_status || s.availability || (s.is_available ? 'AVAILABLE' : 'BUSY')).toUpperCase();
          let availLabel = 'Available';
          if (availRaw === 'BUSY') availLabel = 'Busy';
          else if (availRaw === 'ON_LEAVE' || availRaw === 'ON LEAVE') availLabel = 'On leave';
          else if (availRaw === 'OFFLINE') availLabel = 'Offline';

          return {
            id: `staff-${s.id}`,
            group: 'Staff',
            title: s.name,
            subtitle: `${roleLabel} · ${availLabel}`,
            onSelect: () => {
              openStaffDetail(s.id);
              setSearchQuery('');
              setDebouncedQuery('');
              setShowSearchPopup(false);
            },
          };
        });

      if (staffMatches.length > 0) {
        groups.push({ name: 'Staff', items: staffMatches });
      }
    }

    // 3. Tasks (All roles)
    const taskMatches = (tasks || [])
      .filter((t) => {
        const idStr = String(t.display_id || t.id || '').toLowerCase();
        const desc = String(t.description || '').toLowerCase();
        const roomStr = String(t.room_number || t.room_id || '').toLowerCase();
        const typeStr = String(t.task_type || t.type || '').toLowerCase();
        return idStr.includes(q) || desc.includes(q) || roomStr.includes(q) || typeStr.includes(q);
      })
      .slice(0, 5)
      .map((t) => {
        const desc = t.description || (t.task_type === 'ROOM_CLEANING' ? 'Cleaning' : 'Maintenance');
        const rawStatus = String(t.status || '').toUpperCase();
        let statusLabel = t.status_label || t.status || 'Assigned';
        if (rawStatus === 'IN_PROGRESS' || rawStatus === 'CLEANING' || rawStatus === 'IN_REPAIR') {
          statusLabel = 'In progress';
        } else if (rawStatus === 'COMPLETED' || rawStatus === 'DONE') {
          statusLabel = 'Completed';
        } else if (rawStatus === 'ASSIGNED') {
          statusLabel = 'Assigned';
        } else if (rawStatus === 'PENDING') {
          statusLabel = 'Pending';
        }

        const taskIdTitle = t.display_id ? t.display_id : `Task #${t.id}`;
        const roomPart = t.room_number || t.room_id ? `Room ${t.room_number || t.room_id}` : null;
        const title = roomPart ? `${taskIdTitle} · ${roomPart}` : taskIdTitle;

        return {
          id: `task-${t.id}`,
          group: 'Tasks',
          title,
          subtitle: `${desc} · ${statusLabel}`,
          onSelect: () => {
            openTaskDetail(t.id);
            setSearchQuery('');
            setDebouncedQuery('');
            setShowSearchPopup(false);
          },
        };
      });

    if (taskMatches.length > 0) {
      groups.push({ name: 'Tasks', items: taskMatches });
    }

    return groups;
  }, [debouncedQuery, rooms, staff, tasks, canViewRoomsAndStaff, openRoomDetail, openStaffDetail, openTaskDetail]);

  const flatResults = useMemo(() => {
    return searchGroups.flatMap((g) => g.items);
  }, [searchGroups]);

  // Keep selectedIndex in sync
  useEffect(() => {
    if (flatResults.length > 0) {
      setSelectedIndex(0);
    } else {
      setSelectedIndex(-1);
    }
  }, [flatResults]);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flatResults.length > 0) {
        setSelectedIndex((prev) => (prev < flatResults.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flatResults.length > 0) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : flatResults.length - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < flatResults.length) {
        flatResults[selectedIndex].onSelect();
      } else if (flatResults.length > 0) {
        flatResults[0].onSelect();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowSearchPopup(false);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const handleReset = async () => {
    setIsResetting(true);
    try {
      if (resetSystem) {
        await resetSystem();
      } else {
        await hotelApi.resetSystem();
      }
      if (refreshData) {
        await refreshData();
      }
    } catch (err) {
      console.error('Failed to reset DB:', err);
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-[#dddddd] px-6 flex items-center justify-between sticky top-0 z-20 shadow-2xs">
      {/* Forbidden 403 Toast Alert */}
      {forbiddenToast && (
        <div className="fixed top-5 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-rose-600 text-white rounded-xl shadow-xl border border-white/20 animate-slide-down">
          <AlertTriangle size={18} className="flex-shrink-0 text-white" />
          <span className="text-xs font-semibold">{forbiddenToast}</span>
        </div>
      )}

      {/* Left: Hotel Property Selector Dropdown */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-[#dddddd] hover:bg-[#f7f7f7] transition-all text-left group">
          <Building2 size={18} className="text-[#6a6a6a] group-hover:text-[#222222]" />
          <div>
            <div className="flex items-center gap-1">
              <span className="font-bold text-sm text-[#222222]">Voyage Grand</span>
              <ChevronDown size={14} className="text-[#6a6a6a]" />
            </div>
            <p className="text-[11px] text-[#6a6a6a] font-medium leading-none">Pune · {totalRooms ?? 50} rooms</p>
          </div>
        </button>
      </div>

      {/* Center: Search Bar with Live Popup matching Prototype */}
      <div ref={searchContainerRef} className="flex-1 max-w-md mx-6 relative">
        <div className="relative flex items-center">
          <Search size={16} className="absolute left-3.5 text-[#6a6a6a] pointer-events-none" />
          <input
            type="text"
            placeholder="Search rooms, staff, tasks"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchPopup(true);
            }}
            onFocus={() => {
              if (searchQuery.trim().length >= 1) setShowSearchPopup(true);
            }}
            onKeyDown={handleSearchKeyDown}
            className="w-full bg-white border border-[#dddddd] rounded-full pl-10 pr-4 py-2 text-xs font-medium text-[#222222] placeholder-[#929292] outline-none focus:border-[#222222] focus:ring-1 focus:ring-[#222222] transition-all"
          />
        </div>

        {/* Search Results Dropdown Popup matching Kishor Sir's Prototype */}
        {showSearchPopup && searchQuery.trim().length >= 1 && (
          <div
            className="absolute left-0 right-0 top-11 bg-white border border-[#ebebeb] rounded-[14px] p-1.5 z-50 overflow-y-auto max-h-[420px] animate-slide-down"
            style={{
              boxShadow:
                'rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0',
            }}
          >
            {flatResults.length > 0 ? (
              <div>
                {searchGroups.map((group) => (
                  <div key={group.name} className="mb-1 last:mb-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#6a6a6a] px-2.5 pt-2 pb-1 select-none">
                      {group.name}
                    </div>
                    {group.items.map((item) => {
                      const globalIndex = flatResults.findIndex((r) => r.id === item.id);
                      const isSelected = selectedIndex === globalIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.onSelect}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors flex flex-col items-start cursor-pointer border-none ${
                            isSelected ? 'bg-[#f7f7f7]' : 'bg-transparent hover:bg-[#f7f7f7]'
                          }`}
                        >
                          <span className="text-[13px] font-bold text-[#222222] leading-snug">
                            {item.title}
                          </span>
                          <span className="text-[12px] font-normal text-[#6a6a6a] leading-tight mt-0.5">
                            {item.subtitle}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-[13px] text-[#6a6a6a]">
                No rooms, staff or tasks match “{searchQuery}”.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: Agent Status, Clock, Simulation Toggle, Notifications, Reset DB & User Avatar */}
      <div className="flex items-center gap-3">
        {/* AI Agents Active Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>AI agents active · 4/4</span>
        </div>

        {/* Live Clock & Date */}
        <div className="text-right hidden sm:block">
          <div className="text-xs font-bold text-[#222222] font-mono leading-none">{timeStr}</div>
          <div className="text-[11px] text-[#6a6a6a] font-medium mt-0.5">{dateStr}</div>
        </div>

        {/* Simulation Flask Button (Manager and Supervisor only) */}
        {canSimulate && (
          <button
            onClick={() => setSimulationActive(!simulationActive)}
            title={simulationActive ? 'Stop Simulation' : 'Start Simulation'}
            className={`p-2 rounded-xl border transition-all ${
              simulationActive
                ? 'bg-rose-50 border-[#ff385c] text-[#ff385c]'
                : 'bg-white border-[#dddddd] text-[#6a6a6a] hover:bg-[#f7f7f7] hover:text-[#222222]'
            }`}
          >
            <FlaskConical size={18} />
          </button>
        )}

        {/* Notification Bell Button */}
        <button
          title="Notifications"
          className="relative p-2 rounded-xl border border-[#dddddd] text-[#6a6a6a] hover:bg-[#f7f7f7] hover:text-[#222222] transition-all"
        >
          <Bell size={18} />
        </button>

        {/* Reset DB Button (Manager Only) */}
        {canResetDb && (
          <button
            onClick={() => setShowResetConfirm(true)}
            title="Reset database (Manager only)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
          >
            <RotateCcw size={14} className={isResetting ? 'animate-spin' : ''} />
            <span>Reset DB</span>
          </button>
        )}

        {/* User Profile Pill & Dropdown Menu */}
        <div className="relative pl-2 border-l border-[#ebebeb]" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            type="button"
            className="flex items-center gap-2.5 hover:bg-[#f7f7f7] p-1.5 rounded-xl transition-all cursor-pointer text-left"
          >
            <div className="w-8 h-8 rounded-full bg-[#222222] text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-2xs">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <div className="text-left hidden md:block">
              <div className="flex items-center gap-1">
                <span className="font-bold text-xs text-[#222222]">
                  {user?.name || 'Amit Shah'}
                </span>
                <ChevronDown size={12} className="text-[#6a6a6a]" />
              </div>
              <p className="text-[10px] text-[#6a6a6a] font-medium leading-none">
                {user?.role ? user.role.charAt(0) + user.role.slice(1).toLowerCase() : 'Manager'}
              </p>
            </div>
          </button>

          {/* User Menu Dropdown */}
          {showUserMenu && (
            <div className="absolute right-0 top-12 bg-white rounded-2xl shadow-xl border border-[#dddddd] p-2 min-w-[210px] z-50 animate-scale-up">
              <div className="px-3 py-2 border-b border-[#ebebeb] mb-1">
                <p className="text-xs font-bold text-[#222222] truncate">{user?.name || 'Staff User'}</p>
                <p className="text-[11px] text-[#6a6a6a] truncate mt-0.5">@{user?.username || 'user'}</p>
                <span className="inline-block mt-1.5 px-2 py-0.5 rounded-md bg-[#f2f2f2] text-[10px] font-bold text-[#222222]">
                  {user?.role || 'STAFF'}
                </span>
              </div>

              <button
                onClick={() => {
                  setShowUserMenu(false);
                  logout();
                }}
                type="button"
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-left"
              >
                <LogOut size={14} />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Popup Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs animate-fade-in p-4">
          <div className="bg-white rounded-2xl border border-[#dddddd] shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#222222]">Reset Database?</h3>
                <p className="text-xs text-[#6a6a6a] mt-0.5">Testing action</p>
              </div>
            </div>

            <p className="text-xs text-[#484848] leading-relaxed">
              This will delete all tasks and logs. Continue?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6a6a6a] hover:bg-[#f2f2f2] hover:text-[#222222] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#ff385c] hover:bg-[#e00b41] text-white transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <RotateCcw size={13} className="animate-spin" />
                    <span>Resetting...</span>
                  </>
                ) : (
                  <span>Reset DB</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
