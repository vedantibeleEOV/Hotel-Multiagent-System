import { useState, useRef } from "react";

function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
    if (textareaRef.current)
      textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e) => {
    setText(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  };

  const canSend = !disabled && text.trim();

  return (
    <div style={styles.wrap}>
      <textarea
        ref={textareaRef}
        style={styles.textarea}
        placeholder="Ask me anything about your stay..."
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={disabled}
      />
      <button
        style={{
          ...styles.sendBtn,
          opacity: canSend ? 1 : 0.4,
          cursor: canSend ? "pointer" : "not-allowed",
          background: canSend
            ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
            : "#e2e8f0",
        }}
        onClick={handleSend}
        disabled={!canSend}
        aria-label="Send message"
      >
        ➤
      </button>
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    alignItems: "flex-end",
    gap: "10px",
    padding: "14px 20px",
    borderTop: "1px solid #f1f5f9",
    backgroundColor: "#fff",
    flexShrink: 0,
  },
  textarea: {
    flex: 1,
    resize: "none",
    border: "1.5px solid #e2e8f0",
    borderRadius: "14px",
    padding: "11px 16px",
    fontSize: "14px",
    fontFamily: "inherit",
    lineHeight: "1.5",
    minHeight: "44px",
    maxHeight: "120px",
    maxWidth: "60px",
    outline: "none",
    backgroundColor: "#f8fafc",
    color: "#1e293b",
    overflowY: "auto",
    transition: "border-color 0.15s",
  },
  sendBtn: {
    width: "44px",
    height: "44px",
    borderRadius: "50%",
    border: "none", 
    color: "#fff",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "all 0.15s",
  },
};

export default ChatInput;