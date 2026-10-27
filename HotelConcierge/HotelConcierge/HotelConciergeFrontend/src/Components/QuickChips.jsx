import { useState } from "react";
import { buildChips } from "../utils/intentUtils";

function QuickChips({ hotel, onChipClick }) {
  const [hovered, setHovered] = useState(null);
  const chips = buildChips(hotel);
  if (!chips.length) return null;

  return (
    <div style={styles.wrap}>
      {chips.map((chip, i) => (
        <button
          key={i}
          style={{
            ...styles.chip,
            ...(hovered === i ? styles.chipHover : {}),
          }}
          onClick={() => onChipClick(chip)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    padding: "14px 24px",
    borderTop: "1px solid #ebebeb",
    backgroundColor: "#ffffff",
  },
  chip: {
    fontSize: "13px",
    padding: "8px 16px",
    borderRadius: "999px",
    border: "1px solid #dddddd",
    backgroundColor: "#ffffff",
    color: "#222222",
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    fontWeight: "500",
    transition: "all 0.15s",
    outline: "none",
  },
  chipHover: {
    borderColor: "#222222",
    backgroundColor: "#f7f7f7",
  },
};

export default QuickChips;