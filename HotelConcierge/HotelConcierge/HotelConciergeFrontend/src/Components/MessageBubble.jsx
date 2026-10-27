
function MessageBubble({ message }) {
  const { sender, text, time } = message;
  const isUser = sender === "user";
  if (!text) return null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-end" : "flex-start",
      gap: "6px",
      animation: "bubbleIn 0.2s ease",
    }}>
      <div style={{
        maxWidth: "70%",
        padding: "14px 18px",
        backgroundColor: isUser ? "#ff385c" : "#ffffff",
        color: isUser ? "#ffffff" : "#222222",
        borderRadius: isUser ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
        fontSize: "15px",
        lineHeight: "1.6",
        wordBreak: "break-word",
        boxShadow: isUser
          ? "none"
          : "0 1px 4px rgba(0,0,0,0.08)",
        border: isUser ? "none" : "1px solid #ebebeb",
      }}>
        {text}
      </div>
      <div style={{
        fontSize: "12px",
        color: "#6a6a6a",
        paddingLeft: isUser ? 0 : "4px",
        paddingRight: isUser ? "4px" : 0,
      }}>
        {isUser ? "You · " : "Concierge · "}{time}
      </div>
    </div>
  );
}

export default MessageBubble;