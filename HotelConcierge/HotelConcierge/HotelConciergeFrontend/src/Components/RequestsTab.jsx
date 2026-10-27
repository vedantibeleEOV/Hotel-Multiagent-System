import { useState, useEffect } from "react";
import { getRoomRequests, rateRequest } from "../Services/requestsService.js";

const getTicketId = (dept, id) => {
  const prefix =
    dept?.toLowerCase().includes("maintenance") ? "MNT"
    : dept?.toLowerCase().includes("housekeeping") ? "HKP"
    : dept?.toLowerCase().includes("front") ? "FRD"
    : "RMS";
  return `${prefix}-${String(id + 3000).slice(-4)}`;
};

const STATUS_ORDER = {
  Pending:    0,
  Assigned:   1,
  InProgress: 2,
  Resolved:   3,
};

const TIMELINE_STEPS = [
  { key: "Pending",    label: "Received" },
  { key: "Assigned",  label: "Assigned" },
  { key: "InProgress",label: "In progress" },
  { key: "Resolved",  label: "Resolved" },
];

// ── Star Rating ─────────────────────────────────────────
function StarRating({ taskId, currentRating, onRate }) {
  const [hovered, setHovered]   = useState(0);
  const [selected, setSelected] = useState(currentRating || 0);
  const [submitted, setSubmitted] = useState(currentRating > 0);

  const handleSubmit = async () => {
    if (!selected || submitted) return;
    setSubmitted(true);
    await onRate(taskId, selected);
  };

  if (submitted) {
    return (
      <div style={S.ratingDone}>
        <div style={S.ratingDoneStars}>
          {[1,2,3,4,5].map(s => (
            <svg key={s} width="24" height="24" viewBox="0 0 24 24"
              fill={s <= selected ? "#ff385c" : "#ebebeb"}>
              <path d="M12 2.5l2.94 6.06 6.56.86-4.8 4.62 1.22 6.46L12 17.4l-5.92 3.1 1.22-6.46-4.8-4.62 6.56-.86z"/>
            </svg>
          ))}
        </div>
        <div style={{ fontSize: "16px", fontWeight: "600", color: "#222222" }}>
          Thank you
        </div>
        <div style={{ fontSize: "14px", color: "#6a6a6a", textAlign: "center", maxWidth: "300px" }}>
          Your rating has been shared with the duty manager.
          We hope the rest of your stay is a pleasant one.
        </div>
      </div>
    );
  }

  return (
    <div style={S.ratingWrap}>
      <div style={{ fontSize: "18px", fontWeight: "600", color: "#222222" }}>
        How was the service?
      </div>
      <div style={{ fontSize: "14px", color: "#6a6a6a", marginTop: "4px" }}>
        Your rating goes straight to the duty manager.
      </div>
      <div style={S.stars}>
        {[1,2,3,4,5].map(star => (
          <button
            key={star}
            style={S.starBtn}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => setSelected(star)}
            aria-label={`Rate ${star}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24"
              fill={star <= (hovered || selected) ? "#ff385c" : "none"}
              stroke={star <= (hovered || selected) ? "#ff385c" : "#dddddd"}
              strokeWidth="1.5">
              <path d="M12 2.5l2.94 6.06 6.56.86-4.8 4.62 1.22 6.46L12 17.4l-5.92 3.1 1.22-6.46-4.8-4.62 6.56-.86z"/>
            </svg>
          </button>
        ))}
      </div>
      <button
        style={{
          ...S.submitBtn,
          opacity: selected > 0 ? 1 : 0.4,
          cursor: selected > 0 ? "pointer" : "not-allowed",
        }}
        disabled={selected === 0}
        onClick={handleSubmit}
      >
        Submit rating
      </button>
    </div>
  );
}

// ── Ticket card (left list) ──────────────────────────────
function TicketCard({ req, isSelected, onClick }) {
  const isActive = req.status === "InProgress" || req.status === "Assigned";
  const badgeBg  = isActive ? "#ff385c" : "#f7f7f7";
  const badgeFg  = isActive ? "#ffffff"  : "#222222";
  const badgeShadow = isActive ? "none" : "0 1px 4px rgba(0,0,0,0.12)";
  const statusLabel =
    req.status === "InProgress" ? "In progress"
    : req.status === "Pending"   ? "Received"
    : req.status;

  return (
    <button
      style={{
        ...S.ticketCard,
        background:   isSelected ? "#ffffff" : "#ffffff",
        border: `1px solid ${isSelected ? "#222222" : "#ebebeb"}`,
      }}
      onClick={onClick}
    >
      <span style={S.ticketCardTop}>
        <span style={{ fontSize: "13px", color: "#6a6a6a" }}>
          {getTicketId(req.department, req.taskItemId)} · {req.department}
        </span>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "3px 10px",
          borderRadius: "999px",
          fontSize: "12px",
          fontWeight: "500",
          backgroundColor: badgeBg,
          color: badgeFg,
          boxShadow: badgeShadow,
          whiteSpace: "nowrap",
        }}>
          {statusLabel}
        </span>
      </span>
      <span style={S.ticketTitle}>{req.taskType}</span>
      <span style={S.ticketMeta}>
        Raised {new Date(req.createdDate).toLocaleTimeString([], {
          hour: "2-digit", minute: "2-digit"
        })}
      </span>
    </button>
  );
}

// ── Ticket detail (right panel) ──────────────────────────
function TicketDetail({ req, onRate }) {
  const statusIdx = STATUS_ORDER[req.status] ?? 0;
  const ticketId  = getTicketId(req.department, req.taskItemId);

  const isActive = req.status === "InProgress" || req.status === "Assigned";
  const badgeBg  = isActive ? "#ff385c" : "#f7f7f7";
  const badgeFg  = isActive ? "#ffffff"  : "#222222";
  const badgeShadow = isActive ? "none" : "0 1px 4px rgba(0,0,0,0.12)";
  const statusLabel =
    req.status === "InProgress" ? "In progress"
    : req.status === "Pending"   ? "Received"
    : req.status;

  const timeFor = (idx) => {
    const times = [
      req.createdDate,
      req.assignedDate,
      req.inProgressDate,
      req.resolvedDate,
    ];
    return times[idx]
      ? new Date(times[idx]).toLocaleTimeString([], {
          hour: "2-digit", minute: "2-digit"
        })
      : null;
  };

  const noteFor = (idx, step) => {
    const t = timeFor(idx);
    if (!t) return null;
    if (step.key === "Assigned" && req.assignedTo)
      return `${req.assignedTo} · ${t}`;
    return t;
  };

  return (
    <div style={S.detail}>
      {/* Header */}
      <div style={S.detailHeader}>
        <div>
          <div style={{ fontSize: "13px", color: "#6a6a6a" }}>{ticketId}</div>
          <div style={{ fontSize: "24px", fontWeight: "600", marginTop: "4px", color: "#222222" }}>
            {req.taskType}
          </div>
        </div>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "4px 12px",
          borderRadius: "999px",
          fontSize: "13px",
          fontWeight: "500",
          backgroundColor: badgeBg,
          color: badgeFg,
          boxShadow: badgeShadow,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          {statusLabel}
        </span>
      </div>

      <div style={S.divider} />

      {/* Timeline */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {TIMELINE_STEPS.map((step, i) => {
          const done   = statusIdx > i;
          const active = statusIdx === i;
          const note   = noteFor(i, step);
          const isLast = i === TIMELINE_STEPS.length - 1;

          const dotBg = done || active ? "#ff385c" : "#ffffff";
          const dotBd = done || active ? "#ff385c" : "#dddddd";
          const lineBg = done ? "#ff385c" : "#ebebeb";

          return (
            <div key={step.key} style={{ display: "flex", gap: "16px" }}>
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: "12px",
              }}>
                <span style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "999px",
                  flexShrink: 0,
                  backgroundColor: dotBg,
                  border: `2px solid ${dotBd}`,
                }} />
                {!isLast && (
                  <span style={{
                    width: "2px",
                    flex: 1,
                    minHeight: "26px",
                    backgroundColor: lineBg,
                  }} />
                )}
              </div>
              <div style={{ paddingBottom: "20px" }}>
                <div style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: done || active ? "#222222" : "#aaaaaa",
                }}>
                  {step.key === "Assigned" && req.assignedTo && done
                    ? `Assigned to ${req.assignedTo}`
                    : step.label}
                </div>
                {note && (
                  <div style={{ fontSize: "13px", color: "#6a6a6a", marginTop: "2px" }}>
                    {note}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Staff card */}
      {req.assignedTo && (
        <div style={S.staffCard}>
          <div style={S.staffAvatar}>
            {req.assignedTo[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "16px", fontWeight: "600", color: "#222222" }}>
              {req.assignedTo}
            </div>
            <div style={{ fontSize: "14px", color: "#6a6a6a" }}>
              {req.department}
            </div>
          </div>
          {req.resolvedDate && (
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#ff385c" }}>
              Delivered {new Date(req.resolvedDate).toLocaleTimeString([], {
                hour: "2-digit", minute: "2-digit"
              })}
            </div>
          )}
          {!req.resolvedDate && req.assignedTo && (
            <div style={{ fontSize: "14px", fontWeight: "600", color: "#ff385c" }}>
              On the way
            </div>
          )}
        </div>
      )}

      {/* Rating */}
      {req.status === "Resolved" && (
        <>
          <div style={S.divider} />
          <StarRating
            taskId={req.taskItemId}
            currentRating={req.rating}
            onRate={onRate}
          />
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────
function RequestsTab({ sessionInfo }) {
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading,  setLoading]  = useState(true);

  const load = async () => {
    try {
      const data = await getRoomRequests(
        sessionInfo.hotelId, sessionInfo.roomNo
      );
      const visible = data.filter((r) => r.status !== "Escalated");
      setRequests(visible);
      if (visible.length > 0 && !selected)
        setSelected(visible[0]);
    } catch {
      console.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRate = async (taskId, rating) => {
    await rateRequest(taskId, rating);
    const update = (r) => r.taskItemId === taskId ? { ...r, rating } : r;
    setRequests((prev) => prev.map(update));
    setSelected((s) => s?.taskItemId === taskId ? { ...s, rating } : s);
  };

  return (
    <div style={S.wrap}>
      <h2 style={S.heading}>Your requests</h2>
      <p style={S.subheading}>
        Everything raised from Room {sessionInfo.roomNo} during this stay,
        and who is looking after it.
      </p>

      {loading ? (
        <div style={S.empty}>Loading…</div>
      ) : requests.length === 0 ? (
        <div style={S.empty}>
          No requests yet. Use the Concierge tab to raise one.
        </div>
      ) : (
        <div style={S.layout}>
          {/* Left list */}
          <div style={S.list}>
            {requests.map((req) => (
              <TicketCard
                key={req.taskItemId}
                req={req}
                isSelected={selected?.taskItemId === req.taskItemId}
                onClick={() => setSelected(req)}
              />
            ))}
          </div>

          {/* Right detail */}
          {selected && (
            <TicketDetail req={selected} onRate={handleRate} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────
const S = {
  wrap: {
    padding: "32px 24px 56px",
  },
  heading: {
    margin: "0 0 6px",
    fontSize: "28px",
    fontWeight: "600",
    color: "#222222",
  },
  subheading: {
    margin: "0 0 28px",
    fontSize: "16px",
    color: "#6a6a6a",
  },
  layout: {
    display: "flex",
    gap: "24px",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  list: {
    width: "380px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  ticketCard: {
    textAlign: "left",
    padding: "18px",
    borderRadius: "12px",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontFamily: "inherit",
    transition: "box-shadow 0.15s",
    width: "100%",
  },
  ticketCardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  ticketTitle: {
    display: "block",
    fontSize: "17px",
    fontWeight: "600",
    color: "#222222",
    marginTop: "4px",
  },
  ticketMeta: {
    display: "block",
    fontSize: "13px",
    color: "#6a6a6a",
  },
  detail: {
    flex: 1,
    minWidth: "420px",
    backgroundColor: "#ffffff",
    border: "1px solid #ebebeb",
    borderRadius: "16px",
    padding: "28px",
  },
  detailHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "0",
  },
  divider: {
    height: "1px",
    backgroundColor: "#ebebeb",
    margin: "24px 0",
  },
  staffCard: {
    backgroundColor: "#f7f7f7",
    borderRadius: "12px",
    padding: "18px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
    flexWrap: "wrap",
    marginTop: "4px",
  },
  staffAvatar: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    backgroundColor: "#dddddd",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: "600",
    color: "#444444",
    flexShrink: 0,
  },
  ratingWrap: {
    paddingTop: "0",
  },
  stars: {
    display: "flex",
    gap: "8px",
    margin: "18px 0 20px",
  },
  starBtn: {
    width: "48px",
    height: "48px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    border: "1px solid #dddddd",
    backgroundColor: "#ffffff",
    cursor: "pointer",
    padding: 0,
    transition: "border-color 0.15s",
  },
  submitBtn: {
    height: "48px",
    padding: "0 28px",
    backgroundColor: "#ff385c",
    color: "#ffffff",
    border: "none",
    borderRadius: "999px",
    fontSize: "16px",
    fontWeight: "600",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  },
  ratingDone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
    padding: "8px 0",
  },
  ratingDoneStars: {
    display: "flex",
    gap: "4px",
  },
  empty: {
    textAlign: "center",
    padding: "60px",
    color: "#6a6a6a",
    fontSize: "15px",
  },
};

export default RequestsTab;