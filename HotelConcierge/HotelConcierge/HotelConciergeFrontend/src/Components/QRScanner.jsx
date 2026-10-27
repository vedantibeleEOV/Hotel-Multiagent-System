import { useRef, useState } from "react";
import jsQR from "jsqr";

function QRScanner({ onScanSuccess }) {
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError(null);
    setScanning(true);

    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(
          0, 0, canvas.width, canvas.height
        );

        const code = jsQR(
          imageData.data,
          imageData.width,
          imageData.height
        );

        setScanning(false);

        if (!code) {
          setError("Could not read QR code. Please try a clearer image.");
          return;
        }

        const parts = code.data.split("|");
        if (parts.length !== 2) {
          setError("Invalid QR code format.");
          return;
        }

        onScanSuccess(parts[0].trim(), parts[1].trim());
      };

      img.onerror = () => {
        setScanning(false);
        setError("Could not load image. Please try again.");
      };

      img.src = event.target.result;
    };

    reader.readAsDataURL(file);
  };

  return (
    <div style={styles.page}>
      {/* Top decoration */}
      <div style={styles.topSection}>
        <h1 style={styles.title}>Hotel Concierge</h1>
        <p style={styles.subtitle}>
          Your personal AI assistant for a seamless stay
        </p>
      </div>

      {/* Card */}
      <div style={styles.card}>
        <p style={styles.cardTitle}>Scan Room QR Code</p>
        <p style={styles.cardSubtitle}>
          Select the QR code image provided in your room
        </p>

        <div
          style={styles.uploadArea}
          onClick={() => fileInputRef.current?.click()}
        >
          <span style={{ fontSize: "60px", marginBottom: "10px" }}>📁</span>
          <p style={styles.uploadText}>Click to select QR image</p>
          <p style={styles.uploadHint}>Supports PNG, JPG</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        {scanning && (
          <div style={styles.statusBox}>
            <p style={styles.statusText}>🔍 Reading QR code...</p>
          </div>
        )}

        {error && (
          <div style={styles.errorBox}>
            <p style={styles.errorText}>⚠️ {error}</p>
            <button
              style={styles.retryBtn}
              onClick={() => {
                setError(null);
                fileInputRef.current.value = "";
                fileInputRef.current?.click();
              }}
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Bottom text */}
      <p style={styles.bottomText}>
        🔒 Secure · Available 24/7 · Instant Support
      </p>
    </div>
  );
}




const styles = {
  page: {
    minHeight: "100vh",
    width: "100vw",
    background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem 1rem",
    gap: "24px",
  },
  topSection: {
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
  },
  iconCircle: {
    width: "80px",
    height: "80px",
    borderRadius: "50%",
    backgroundColor: "rgba(255,255,255,0.1)",
    border: "2px solid rgba(255,255,255,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "8px",
  },
  title: {
    fontSize: "65px",
    fontWeight: "700",
    color: "#ffffff",
    margin: 0,
  }, 
  subtitle: {
    fontSize: "45px",
    color: "rgba(255,255,255,0.6)",
    margin: 0,
  },
  // card: {
  //   backgroundColor: "#ffffff",
  //   borderRadius: "20px",
  //   padding: "2.5rem",
  //   width: "90%",
  //   maxWidth: "650px",
  //   textAlign: "center",
  //   boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  // },

// card: {
//     backgroundColor: "#fff",
//     borderRadius: "20px",
//     padding: "2.5rem",
//     width: "90%",
//     maxWidth: "650px",       // ← good for web
//     textAlign: "center",
//     boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
//     marginTop: "8px",
//   },


// card: {
//   backgroundColor: "#fff",
//   borderRadius: "20px",
//   padding: "3rem",           // ← more padding
//   width: "90%",              // ← 90% of screen width
//   maxWidth: "850px",         // ← increased from 480px
//   textAlign: "center",
//   boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
//   marginTop: "8px",
// },
// uploadArea: {
//   border: "2px dashed #d1d5db",
//   borderRadius: "14px",
//   padding: "3.5rem 1rem",    // ← taller upload area
//   cursor: "pointer",
//   display: "flex",
//   flexDirection: "column",
//   alignItems: "center",
//   backgroundColor: "#f9fafb",
//   marginBottom: "1rem",
// },

// wrap: {
//   display: "flex",
//   flexDirection: "column",
//   alignItems: "center",
//   justifyContent: "center",  // ← add this
//   gap: "16px",
//   padding: "2rem 1rem",
//   width: "100%",
//   minHeight: "100vh",         // ← add this
// },

card: {
  backgroundColor: "#fff",
  borderRadius: "20px",
  padding: "3rem",
  width: "95%",
  maxWidth: "2000px",
  minHeight: "1000px",
  textAlign: "center",
  boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  marginTop: "8px",
  boxSizing: "border-box",
},

uploadArea: {
  border: "2px dashed #d1d5db",
  borderRadius: "14px",
  padding: "5rem 1rem",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#f9fafb",
  marginBottom: "1rem",
  width: "100%",
  minHeight: "600px",
  boxSizing: "border-box",
},

wrap: {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "16px",
  padding: "2rem 1rem",
  width: "100%",
  minHeight: "100vh",
  boxSizing: "border-box",
},


  cardTitle: {
    fontSize: "48px",
    fontWeight: "600",
    color: "#111827",
    marginBottom: "6px",
  },
  cardSubtitle: {
    fontSize: "33px",
    color: "#6b7280",
    marginBottom: "1.5rem",
    lineHeight: "1.5",
  },
  // uploadArea: {
  //   border: "2px dashed #d1d5db",
  //   borderRadius: "16px",
  //   padding: "2rem 1rem",
  //   cursor: "pointer",
  //   display: "flex",
  //   flexDirection: "column",
  //   alignItems: "center",
  //   backgroundColor: "#f9fafb",
  //   marginBottom: "1rem",
  //   transition: "all 0.2s",
  // },
  uploadText: {
    fontSize: "35px",
    color: "#374151",
    fontWeight: "500",
    marginBottom: "4px",
  },
  uploadHint: {
    fontSize: "20px",
    color: "#9ca3af",
  },
  statusBox: {
    backgroundColor: "#dbeafe",
    borderRadius: "10px",
    padding: "10px",
    marginTop: "12px",
  },
  statusText: {
    fontSize: "34px",
    color: "#1e40af",
  },
  errorBox: {
    backgroundColor: "#fee2e2",
    borderRadius: "10px",
    padding: "12px",
    marginTop: "12px",
  },
  errorText: {
    fontSize: "24px",
    color: "#991b1b",
    marginBottom: "10px",
  },
  retryBtn: {
    padding: "7px 18px",
    borderRadius: "8px",
    backgroundColor: "#2563eb",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontSize: "13px",
  },
  bottomText: {
    fontSize: "32px",
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
  },
};



export default QRScanner;
