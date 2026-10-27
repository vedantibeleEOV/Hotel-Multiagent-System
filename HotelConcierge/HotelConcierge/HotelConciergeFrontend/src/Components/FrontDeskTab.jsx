import { useState, useEffect } from "react";
import { getRequests, updateRequestStatus } from "../Services/requestsService.js";

const STATUS_STYLES = {
  Pending:    { bg: "#f7f7f7",  color: "#222222", shadow: "0 1px 4px rgba(0,0,0,0.1)", label: "Pending" },
  Escalated:  { bg: "#fff1f2",  color: "#e11d48", shadow: "0 1px 4px rgba(225,29,72,0.15)", label: "Escalated" },
  Assigned:   { bg: "#ff385c", color: "#ffffff",  label: "Assigned" },
  InProgress: { bg: "#ff385c", color: "#ffffff",  label: "In progress" },
  Resolved:   { bg: "#f7f7f7", color: "#222222",  shadow: "0 1px 4px rgba(0,0,0,0.1)", label: "Resolved" },
};

const getTicketId = (dept, id) => {
  const prefix =
    dept?.toLowerCase().includes("maintenance") ? "MNT"
    : dept?.toLowerCase().includes("housekeeping") ? "HKP"
    : dept?.toLowerCase().includes("front") ? "FRD"
    : "RMS";
  return `${prefix}-${String(id + 3000).slice(-4)}`;
};

const NEXT = {
  Pending:    { status: "Assigned",   label: "Assign →" },
  Escalated:  { status: "Assigned",   label: "Assign →" },
  Assigned:   { status: "InProgress", label: "Start work" },
  InProgress: { status: "Resolved",   label: "Mark resolved" },
};

function FrontDeskTab({ sessionInfo }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [updating, setUpdating] = useState(null);
  const [assignInput, setAssignInput] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      const data = await getRequests(sessionInfo.hotelId);
      setRequests(data);
    } catch {
      console.error("Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdvance = async (req) => {
    const next = NEXT[req.status];
    if (!next) return;
    setUpdating(req.taskItemId);
    try {
      const staffName = assignInput[req.taskItemId] || req.assignedTo || "";
      const updated = await updateRequestStatus(
        req.taskItemId, next.status, staffName
      );
      setRequests((prev) =>
        prev.map((r) => r.taskItemId === req.taskItemId ? updated : r)
      );
    } catch {
      console.error("Failed");
    } finally {
      setUpdating(null);
    }
  };

  const fmt = (date) => date
    ? new Date(date).toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit"
      })
    : "—";

  const filtered = filter === "all"
    ? requests
    : filter === "open"
    ? requests.filter(r => r.status !== "Resolved")
    : requests.filter(r => r.status === "Resolved");

  const openCount = requests.filter(r => r.status !== "Resolved").length;
  const resolvedCount = requests.filter(r => r.status === "Resolved").length;

  return (
    <div style={styles.wrap}>
      <h2 style={styles.heading}>Front desk — live queue</h2>
      <p style={styles.subheading}>
        Requests arriving from guest rooms. Advancing a ticket updates
        the guest's view instantly.
      </p>

      {/* Stats */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Open requests</div>
          <div style={styles.statValue}>{openCount}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Median first reply</div>
          <div style={styles.statValue}>—</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Resolved today</div>
          <div style={styles.statValue}>{resolvedCount}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.toolbar}>
        <div style={styles.filters}>
          {[
            { key: "all",      label: "All" },
            { key: "open",     label: "Open" },
            { key: "resolved", label: "Resolved" },
          ].map(({ key, label }) => (
            <button
              key={key}
              style={{
                ...styles.filterBtn,
                backgroundColor: filter === key ? "#222222" : "#ffffff",
                color:           filter === key ? "#ffffff" : "#6a6a6a",
                borderColor:     filter === key ? "#222222" : "#dddddd",
              }}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button style={styles.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <div style={styles.tableHead}>
          <div>Ticket</div>
          <div>Room</div>
          <div>Request</div>
          <div>Department</div>
          <div>Priority</div>
          <div>Received</div>
          <div>Status</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={styles.emptyRow}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={styles.emptyRow}>No requests found.</div>
        ) : (
          filtered.map((req) => {
            const sc = STATUS_STYLES[req.status] || STATUS_STYLES.Pending;
            const next = NEXT[req.status];
            const isUpdating = updating === req.taskItemId;

            return (
              <div key={req.taskItemId} style={styles.tableRow}>
                <div style={styles.ticketId}>
                  {getTicketId(req.department, req.taskItemId)}
                </div>
                <div style={styles.cell}>{req.roomNo || "—"}</div>
                <div style={styles.requestCell}>{req.taskType}</div>
                <div style={styles.cell}>{req.department}</div>
                <div style={{
                  ...styles.cell,
                  color: req.priority === "High" ? "#dc2626" : "#222222",
                }}>
                  {req.priority}
                </div>
                <div style={styles.timeCell}>{fmt(req.createdDate)}</div>

                {/* Status badge */}
                <div style={styles.cell}>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "13px",
                    fontWeight: "500",
                    backgroundColor: sc.bg,
                    color: sc.color,
                    boxShadow: sc.shadow || "none",
                    whiteSpace: "nowrap",
                  }}>
                    {sc.label}
                  </span>
                </div>

                {/* Action */}
                <div style={styles.actionCell}>
                  {next ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {(req.status === "Pending" || req.status === "Escalated") && (
                        <input
                          style={styles.assignInput}
                          placeholder="Staff name"
                          value={assignInput[req.taskItemId] || ""}
                          onChange={(e) =>
                            setAssignInput((prev) => ({
                              ...prev,
                              [req.taskItemId]: e.target.value,
                            }))
                          }
                        />
                      )}
                      <button
                        style={{
                          ...styles.actionBtn,
                          opacity: isUpdating ? 0.5 : 1,
                        }}
                        disabled={isUpdating}
                        onClick={() => handleAdvance(req)}
                      >
                        {isUpdating ? "..." : next.label}
                      </button>
                    </div>
                  ) : (
                    <span style={styles.closedText}>Closed</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const COL = "110px 70px 1fr 140px 80px 90px 120px 160px";

const styles = {
  wrap: {
    padding: "32px 24px 56px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  heading: {
    margin: 0,
    fontSize: "28px",
    fontWeight: "600",
    color: "#222222",
  },
  subheading: {
    margin: 0,
    fontSize: "15px",
    color: "#6a6a6a",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "16px",
  },
  statCard: {
    backgroundColor: "#ffffff",
    border: "1px solid #ebebeb",
    borderRadius: "12px",
    padding: "20px",
  },
  statLabel: { fontSize: "14px", color: "#6a6a6a", marginBottom: "4px" },
  statValue: { fontSize: "32px", fontWeight: "600", color: "#222222", marginTop: "4px" },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filters: { display: "flex", gap: "8px" },
  filterBtn: {
    height: "36px",
    padding: "0 18px",
    borderRadius: "999px",
    border: "1px solid",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  },
  refreshBtn: {
    height: "36px",
    padding: "0 16px",
    border: "1px solid #dddddd",
    borderRadius: "999px",
    backgroundColor: "#ffffff",
    color: "#222222",
    fontSize: "13px",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  tableWrap: {
    border: "1px solid #ebebeb",
    borderRadius: "12px",
    overflow: "hidden",
  },
  tableHead: {
    display: "grid",
    gridTemplateColumns: COL,
    gap: "16px",
    padding: "14px 20px",
    backgroundColor: "#f7f7f7",
    fontSize: "13px",
    color: "#6a6a6a",
    fontWeight: "500",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: COL,
    gap: "16px",
    alignItems: "center",
    padding: "16px 20px",
    borderTop: "1px solid #ebebeb",
    backgroundColor: "#ffffff",
  },
  ticketId: { fontSize: "13px", color: "#6a6a6a", fontFamily: "monospace" },
  cell: { fontSize: "14px", color: "#222222" },
  requestCell: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#222222",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  timeCell: { fontSize: "13px", color: "#6a6a6a" },
  actionCell: { display: "flex", flexDirection: "column" },
  assignInput: {
    height: "32px",
    padding: "0 10px",
    border: "1px solid #ebebeb",
    borderRadius: "8px",
    fontSize: "13px",
    fontFamily: "inherit",
    outline: "none",
    backgroundColor: "#f7f7f7",
    color: "#222222",
    width: "100%",
  },
  actionBtn: {
    height: "36px",
    padding: "0 14px",
    backgroundColor: "#ffffff",
    color: "#222222",
    border: "1px solid #222222",
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    transition: "opacity 0.15s",
  },
  closedText: { fontSize: "14px", color: "#6a6a6a" },
  emptyRow: {
    padding: "48px",
    textAlign: "center",
    color: "#6a6a6a",
    fontSize: "15px",
    borderTop: "1px solid #ebebeb",
  },
};

export default FrontDeskTab;