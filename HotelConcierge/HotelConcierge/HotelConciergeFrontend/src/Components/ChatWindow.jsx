import { useState, useRef, useEffect } from "react";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import QuickChips from "./QuickChips";
import { sendMessage } from "../Services/ChatService.js";
import { detectIntent } from "../utils/intentUtils";

function InputBox({ onSend, disabled }) {
  const [text, setText] = useState("");
  const ref = useRef(null);

  const send = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
    if (ref.current) ref.current.style.height = "auto";
  };

  return (
    <div style={inputStyles.wrap}>
      <textarea
        ref={ref}
        style={inputStyles.textarea}
        placeholder="Message concierge…"
        value={text}
        rows={1}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          if (ref.current) {
            ref.current.style.height = "auto";
            ref.current.style.height =
              Math.min(ref.current.scrollHeight, 120) + "px";
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button
        style={{
          ...inputStyles.btn,
          opacity: !text.trim() || disabled ? 0.4 : 1,
          cursor: !text.trim() || disabled ? "not-allowed" : "pointer",
        }}
        onClick={send}
        disabled={!text.trim() || disabled}
      >
        Send
      </button>
    </div>
  );
}

const inputStyles = {
  wrap: {
    display: "flex",
    alignItems: "flex-end",
    gap: "12px",
    padding: "16px 24px",
    borderTop: "1px solid #ebebeb",
    backgroundColor: "#ffffff",
  },
  textarea: {
    flex: 1,
    resize: "none",
    border: "1px solid #ebebeb",
    borderRadius: "24px",
    padding: "12px 18px",
    fontSize: "15px",
    fontFamily: "inherit",
    lineHeight: "1.5",
    minHeight: "48px",
    maxHeight: "120px",
    outline: "none",
    backgroundColor: "#f7f7f7",
    color: "#222222",
    transition: "border-color 0.15s",
  },
  btn: {
    height: "48px",
    padding: "0 24px",
    backgroundColor: "#ff385c",
    color: "#ffffff",
    border: "none",
    borderRadius: "24px",
    fontSize: "15px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
    transition: "opacity 0.15s",
  },
};

function ChatWindow({ sessionInfo, sessionId }) {
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: `Welcome to Room ${sessionInfo.roomNo} at ${sessionInfo.hotelName}! How can I assist you today?`,
      intent: "general",
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit",
      }),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const now = () =>
    new Date().toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit",
    });

  const handleSend = async (text) => {
    if (!text.trim() || isLoading) return;

    const history = messages
      .filter((m) => m.text)
      .slice(-10)
      .map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.text,
      }));

    setMessages((prev) => [
      ...prev,
      { sender: "user", text, time: now() },
    ]);
    setIsLoading(true);

    try {
      const data = await sendMessage(
        text, sessionInfo.hotelId, history, sessionId, sessionInfo.roomNo
      );
      const reply = data.reply || "I'm unable to process your request.";
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: reply,
          intent: detectIntent(reply),
          time: now(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: "Unable to reach hotel system. Please contact the front desk.",
          intent: "general",
          time: now(),
        },
      ]);
    }
    setIsLoading(false);
  };

  return (
    <div style={styles.layout}>

      {/* Left rail */}
      <div style={styles.rail}>
        <div style={styles.railCard}>
          <div style={styles.railHeader}>
            <div style={styles.railAvatar}>
              {sessionInfo.hotelName?.[0] || "H"}
            </div>
            <div>
              <div style={styles.railRoomNo}>Room {sessionInfo.roomNo}</div>
              <div style={styles.railSub}>
                {sessionInfo.roomType || "Standard"}
              </div>
            </div>
          </div>
          <div style={styles.railDivider} />
          <div style={styles.railRows}>
            <div style={styles.railRow}>
              <span style={styles.railKey}>Hotel</span>
              <span style={styles.railVal}>{sessionInfo.hotelName}</span>
            </div>
            <div style={styles.railRow}>
              <span style={styles.railKey}>Front desk</span>
              <span style={styles.railVal}>Dial 0</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div style={styles.chatArea}>
        <div style={styles.messages} className="chat-messages">
          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>

        <QuickChips hotel={sessionInfo} onChipClick={handleSend} />
        <InputBox onSend={handleSend} disabled={isLoading} />
      </div>

    </div>
  );
}

const styles = {
  layout: {
    display: "flex",
    alignItems: "stretch",
    flex: 1,
    minHeight: "700px",
  },
  rail: {
    width: "320px",
    flexShrink: 0,
    borderRight: "1px solid #ebebeb",
    padding: "24px",
    backgroundColor: "#ffffff",
  },
  railCard: {
    border: "1px solid #ebebeb",
    borderRadius: "16px",
    padding: "20px",
  },
  railHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  railAvatar: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    backgroundColor: "#f7f7f7",
    border: "1px solid #ebebeb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "20px",
    fontWeight: "600",
    color: "#222222",
    flexShrink: 0,
  },
  railRoomNo: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#222222",
  },
  railSub: {
    fontSize: "14px",
    color: "#6a6a6a",
    marginTop: "2px",
  },
  railDivider: {
    height: "1px",
    backgroundColor: "#ebebeb",
    margin: "18px 0",
  },
  railRows: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  railRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    fontSize: "14px",
  },
  railKey: { color: "#6a6a6a" },
  railVal: { color: "#222222", fontWeight: "600" },
  chatArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f7f7f7",
  },
  // messages: {
  //   flex: 1,
  //   overflowY: "auto",
  //   padding: "24px",
  //   display: "flex",
  //   flexDirection: "column",
  //   gap: "20px",
  //   minHeight: "400px",
  // },

  messages: {
  flex: 1,
  overflowY: "auto",
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "20px",
  height: 0,              // ← critical fix, forces flex child to scroll
  scrollbarWidth: "thin",
  scrollbarColor: "#dddddd transparent",
},
};

export default ChatWindow;