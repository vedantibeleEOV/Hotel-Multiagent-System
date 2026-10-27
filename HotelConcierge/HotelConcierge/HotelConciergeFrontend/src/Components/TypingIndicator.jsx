function TypingIndicator() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "6px",
    }}>
      <div style={{
        padding: "14px 18px",
        backgroundColor: "#ffffff",
        border: "1px solid #ebebeb",
        borderRadius: "20px 20px 20px 4px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        display: "flex",
        gap: "5px",
        alignItems: "center",
      }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: "#6a6a6a",
            display: "inline-block",
            animation: `dotPulse 1.2s ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <div style={{ fontSize: "12px", color: "#6a6a6a", paddingLeft: "4px" }}>
        Concierge · typing
      </div>
    </div>
  );
}

export default TypingIndicator;