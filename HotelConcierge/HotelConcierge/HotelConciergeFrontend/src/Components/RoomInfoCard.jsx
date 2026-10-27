function RoomInfoCard({ roomInfo }) {
  if (!roomInfo) return null;

  return (
    <div style={styles.card}>
      <div style={styles.row}>
        <div style={styles.iconWrap}>
          <span style={{ fontSize: "18px" }}>🛏️</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={styles.roomNo}>Room {roomInfo.roomNo}</div>
          <div style={styles.roomType}>{roomInfo.roomType || "Standard Room"}</div>
        </div>
        <div style={styles.hotelBadge}>
          {roomInfo.hotelName}
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: "linear-gradient(135deg, #1e3a5f, #0f172a)",
    padding: "14px 20px",
    flexShrink: 0,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  iconWrap: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    backgroundColor: "rgba(255,255,255,0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  roomNo: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#ffffff",
  },
  roomType: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.6)",
    marginTop: "2px",
  },
  hotelBadge: {
    fontSize: "11px",
    padding: "4px 12px",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: "20px",
    color: "rgba(255,255,255,0.9)",
    whiteSpace: "nowrap",
    border: "1px solid rgba(255,255,255,0.2)",
  },
};

export default RoomInfoCard;