//import { HOTELS } from "../utils/intentUtils";
function ChatHeader({ hotels, selectedHotel, onHotelChange, loading }) {
  return (
    <div style={styles.header}>
      <div style={styles.avatarWrap}>
        <span style={{ fontSize: "20px" }}>🏨</span>
      </div>
 
      <div style={styles.info}>
        <div style={styles.hotelName}>
          {selectedHotel ? selectedHotel.hotelName : "Hotel Concierge"}
        </div>
        <div style={styles.status}>
          <span style={styles.dot} />
          AI assistant · always available
        </div>
      </div>

      <div style={styles.pickerWrap}>
        <label style={styles.pickerLabel} htmlFor="hotel-select">
          Hotel
        </label>
        <select
          id="hotel-select"
          style={styles.select}
          value={selectedHotel?.id || ""}
          onChange={(e) =>
            onHotelChange(hotels.find((h) => h.id === Number(e.target.value)))
          }
          disabled={loading}
        >
          {loading && <option>Loading...</option>}
          {hotels.map((h) => (
            <option key={h.id} value={h.id}>
              {h.hotelName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const styles = {
  header: {
    padding: "14px 20px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    backgroundColor: "#fff",
    flexShrink: 0,
  },
  avatarWrap: {
    width: "40px", height: "40px", borderRadius: "50%",
    backgroundColor: "#dbeafe", display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  info: { flex: 1 },
  hotelName: { fontSize: "15px", fontWeight: "600", color: "#111827" },
  status: {
    fontSize: "12px", color: "#6b7280",
    display: "flex", alignItems: "center", gap: "5px", marginTop: "2px",
  },
  dot: {
    width: "7px", height: "7px", borderRadius: "50%",
    backgroundColor: "#22c55e", display: "inline-block",
  },
  pickerWrap: { display: "flex", alignItems: "center", gap: "8px" },
  pickerLabel: { fontSize: "12px", color: "#9ca3af" },
  select: {
    fontSize: "13px", padding: "5px 10px", borderRadius: "8px",
    border: "1px solid #e5e7eb", backgroundColor: "#f9fafb",
    color: "#374151", cursor: "pointer", outline: "none",
  },
};

export default ChatHeader;
