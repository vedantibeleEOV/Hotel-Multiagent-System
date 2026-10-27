import { useRef } from "react";
import jsQR from "jsqr";

function ScanTab({ validating, sessionInfo, scanError, onScanSuccess, onEnterChat }) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (!code) {
          alert("Could not read QR code. Try a clearer image.");
          return;
        }
        const parts = code.data.split("|");
        if (parts.length !== 2) {
          alert("Invalid QR format.");
          return;
        }
        onScanSuccess(parts[0].trim(), parts[1].trim());
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.hero}>
        <h1 style={styles.heading}>Scan your room QR code</h1>
        <p style={styles.sub}>
          Select the QR code image from your room card. Your concierge
          will open with your stay details already loaded.
        </p>
      </div>

      <div style={styles.card}>

        {/* Idle */}
        {!validating && !sessionInfo && (
          <>
            <div
              style={styles.dropzone}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg width="48" height="48" viewBox="0 0 32 32"
                fill="none" stroke="#222222" strokeWidth="1.5">
                <path d="M4 11V4h7M28 11V4h-7M4 21v7h7M28 21v7h-7" />
                <rect x="10" y="10" width="5" height="5"
                  fill="#222222" stroke="none" />
                <rect x="17" y="10" width="5" height="5"
                  fill="#ff385c" stroke="none" />
                <rect x="10" y="17" width="5" height="5"
                  fill="#222222" stroke="none" />
                <rect x="17" y="17" width="5" height="5"
                  fill="#222222" stroke="none" />
              </svg>
              <div style={styles.dropzoneText}>Click to select QR image</div>
              <div style={styles.dropzoneHint}>
                PNG or JPG · printed card in your room
              </div>
            </div>

            <button
              type="button"
              style={{
                marginTop: "16px",
                padding: "12px 20px",
                backgroundColor: "#f7f7f7",
                border: "1px solid #ebebeb",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#222222",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                width: "100%",
                transition: "background-color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#ededed")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#f7f7f7")}
              onClick={() => onScanSuccess("Grand Palace", "405")}
            >
              ⚡ Quick Connect: Room 405 (Grand Palace)
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </>
        )}

        {/* Scanning */}
        {validating && (
          <div style={styles.scanningBox}>
            <div style={styles.scanLine} />
            <div style={styles.scanningText}>Verifying with hotel system...</div>
            <div style={styles.scanningHint}>Please wait</div>
          </div>
        )}

        {/* Success */}
        {!validating && sessionInfo && (
          <div>
            <div style={styles.successBanner}>
              <div style={styles.successIconWrap}>✓</div>
              <div>
                <div style={styles.successTitle}>Room verified</div>
                <div style={styles.successSub}>{sessionInfo.hotelName}</div>
              </div>
            </div>

            <div style={styles.grid}>
              <div style={styles.gridItem}>
                <div style={styles.gridLabel}>Room</div>
                <div style={styles.gridValue}>
                  {sessionInfo.roomNo} · {sessionInfo.roomType || "Standard"}
                </div>
              </div>
              <div style={styles.gridItem}>
                <div style={styles.gridLabel}>Hotel</div>
                <div style={styles.gridValue}>{sessionInfo.hotelName}</div>
              </div>
            </div>

            <button style={styles.ctaBtn} onClick={onEnterChat}>
              Continue to concierge →
            </button>
          </div>
        )}

        {/* Error */}
        {scanError && (
          <div style={styles.errorBanner}>⚠ {scanError}</div>
        )}
      </div>

      <div style={styles.footer}>
        Secure · Available 24 hours · No app required
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "32px",
    padding: "64px 24px 80px",
  },
  hero: {
    textAlign: "center",
    maxWidth: "560px",
  },
  heading: {
    margin: "0 0 12px",
    fontSize: "36px",
    fontWeight: "600",
    lineHeight: "1.2",
    color: "#222222",
  },
  sub: {
    margin: 0,
    fontSize: "16px",
    color: "#6a6a6a",
    lineHeight: "1.6",
  },
  card: {
    width: "600px",
    maxWidth: "100%",
    border: "1px solid #ebebeb",
    borderRadius: "16px",
    padding: "32px",
    backgroundColor: "#ffffff",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  },
  dropzone: {
    border: "2px dashed #dddddd",
    borderRadius: "12px",
    backgroundColor: "#f7f7f7",
    height: "260px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    cursor: "pointer",
    transition: "border-color 0.15s",
  },
  dropzoneText: {
    fontSize: "16px",
    fontWeight: "500",
    color: "#222222",
  },
  dropzoneHint: {
    fontSize: "13px",
    color: "#6a6a6a",
  },
  scanningBox: {
    border: "1px solid #ebebeb",
    borderRadius: "12px",
    backgroundColor: "#f7f7f7",
    height: "260px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    overflow: "hidden",
    position: "relative",
  },
  scanLine: {
    position: "absolute",
    top: "30px",
    left: 0,
    right: 0,
    height: "2px",
    backgroundColor: "#ff385c",
    animation: "scanSweep 1.1s ease infinite alternate",
  },
  scanningText: {
    fontSize: "16px",
    fontWeight: "500",
    color: "#222222",
  },
  scanningHint: {
    fontSize: "13px",
    color: "#6a6a6a",
  },
  successBanner: {
    backgroundColor: "#f0faf4",
    border: "1px solid #b7dfca",
    borderRadius: "12px",
    padding: "16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "20px",
  },
  successIconWrap: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    backgroundColor: "#008a05",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: "700",
    flexShrink: 0,
  },
  successTitle: {
    fontSize: "15px",
    fontWeight: "600",
    color: "#222222",
  },
  successSub: {
    fontSize: "13px",
    color: "#6a6a6a",
    marginTop: "2px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
    marginBottom: "24px",
  },
  gridItem: {
    backgroundColor: "#f7f7f7",
    borderRadius: "10px",
    padding: "16px",
  },
  gridLabel: {
    fontSize: "12px",
    color: "#6a6a6a",
    marginBottom: "4px",
  },
  gridValue: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#222222",
  },
  ctaBtn: {
    display: "block",
    width: "100%",
    padding: "16px 24px",
    backgroundColor: "#ff385c",
    color: "#ffffff",
    border: "none",
    borderRadius: "12px",
    fontSize: "16px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "background 0.15s",
  },
  errorBanner: {
    backgroundColor: "#fff5f5",
    border: "1px solid #ffbdbd",
    color: "#c13515",
    padding: "14px 16px",
    borderRadius: "10px",
    fontSize: "14px",
    marginTop: "16px",
  },
  footer: {
    fontSize: "13px",
    color: "#6a6a6a",
  },
};

export default ScanTab;