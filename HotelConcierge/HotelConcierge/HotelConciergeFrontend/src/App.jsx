// import { useState } from "react";
// import QRScanner from "./components/QRScanner";
// import ChatWindow from "./components/ChatWindow";
// import { validateQR } from "./services/chatService";

// function App() {
//   const [sessionInfo, setSessionInfo] = useState(null);
//   const [validating, setValidating] = useState(false);
//   const [scanError, setScanError] = useState(null);

//   const handleScanSuccess = async (hotelName, roomNo) => {
//     setValidating(true);
//     setScanError(null);
//     try {
//       const result = await validateQR(hotelName, roomNo);
//       if (result.isValid) {
//         setSessionInfo(result);
//       } else {
//         setScanError(result.message || "Invalid QR code.");
//       }
//     } catch {
//       setScanError("Could not reach hotel system. Try again.");
//     } finally {
//       setValidating(false);
//     }
//   };

//   if (validating) {
//     return (
//       <div style={styles.fullScreen}>
//         <div style={styles.loadingCard}>
//           <div style={styles.spinner}>⏳</div>
//           <p style={styles.loadingText}>Verifying your room...</p>
//         </div>
//       </div>
//     );
//   }

//   if (!sessionInfo) {
//     return (
//       <div style={styles.fullScreen}>
//         <QRScanner onScanSuccess={handleScanSuccess} />
//         {scanError && (
//           <div style={styles.scanError}>
//             ⚠️ {scanError}
//           </div>
//         )}
//       </div>
//     );
//   }

//   return (
//     <div style={styles.chatPage}>
//       <ChatWindow sessionInfo={sessionInfo} />
//     </div>
//   );
// }

// const styles = {
//   fullScreen: {
//     width: "100vw",
//     minHeight: "100vh",
//     background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
//     display: "flex",
//     flexDirection: "column",
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   chatPage: {
//     width: "100vw",
//     minHeight: "100vh",
//     background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
//     display: "flex",
//     alignItems: "center",
//     justifyContent: "center",
//     padding: "1rem",
//   },
//   loadingCard: {
//     backgroundColor: "#fff",
//     borderRadius: "16px",
//     padding: "2.5rem 3rem",
//     textAlign: "center",
//     boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
//   },
//   spinner: {
//     fontSize: "36px",
//     marginBottom: "12px",
//     animation: "spin 1s linear infinite",
//   },
//   loadingText: {
//     color: "#6b7280",
//     fontSize: "15px",
//   },
//   scanError: {
//     position: "fixed",
//     bottom: "2rem",
//     left: "50%",
//     transform: "translateX(-50%)",
//     backgroundColor: "#fee2e2",
//     color: "#991b1b",
//     padding: "12px 20px",
//     borderRadius: "10px",
//     fontSize: "14px",
//     boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
//     whiteSpace: "nowrap",
//   },
// };

// export default App;

// 2nd
// import { useState } from "react";
// import ScanTab from "./components/ScanTab";
// import ChatWindow from "./components/ChatWindow";
// import { validateQR } from "./services/chatService";

// function App() {
//   const [screen, setScreen] = useState("scan"); // "scan" | "chat"
//   const [sessionInfo, setSessionInfo] = useState(null);
//   const [validating, setValidating] = useState(false);
//   const [scanError, setScanError] = useState(null);

//   const handleScanSuccess = async (hotelName, roomNo) => {
//     setValidating(true);
//     setScanError(null);
//     try {
//       const result = await validateQR(hotelName, roomNo);
//       if (result.isValid) {
//         setSessionInfo(result);
//       } else {
//         setScanError(result.message || "Invalid QR code.");
//       }
//     } catch {
//       setScanError("Could not reach hotel system. Try again.");
//     } finally {
//       setValidating(false);
//     }
//   };

//   return (
//     <div style={styles.page}>

//       {/* Top bar */}
//       <div style={styles.topBar}>
//         <div style={styles.topBarLeft}>
//           <span style={styles.brand}>Concierge</span>
//           <span style={styles.divider} />
//           <span style={styles.brandSub}>Guest Portal</span>
//           <span style={{ flex: 1 }} />
//           {sessionInfo && (
//             <>
//               <span style={styles.hotelLabel}>{sessionInfo.hotelName}</span>
//               <span style={styles.roomTag}>Room {sessionInfo.roomNo}</span>
//             </>
//           )}
//         </div>
//       </div>

//       {/* Tab bar */}
//       <div style={styles.tabBar}>
//         <button
//           style={{
//             ...styles.tab,
//             ...(screen === "scan" ? styles.tabActive : {}),
//           }}
//           onClick={() => setScreen("scan")}
//         >
//           Scan
//         </button>
//         <button
//           style={{
//             ...styles.tab,
//             ...(screen === "chat" ? styles.tabActive : {}),
//             opacity: !sessionInfo ? 0.4 : 1,
//             cursor: !sessionInfo ? "not-allowed" : "pointer",
//           }}
//           onClick={() => sessionInfo && setScreen("chat")}
//         >
//           Concierge
//         </button>
//       </div>

//       {/* Content */}
//       <div style={styles.content}>
//         {screen === "scan" && (
//           <ScanTab
//             validating={validating}
//             sessionInfo={sessionInfo}
//             scanError={scanError}
//             onScanSuccess={handleScanSuccess}
//             onEnterChat={() => setScreen("chat")}
//           />
//         )}
//         {screen === "chat" && sessionInfo && (
//           <ChatWindow sessionInfo={sessionInfo} />
//         )}
//       </div>

//     </div>
//   );
// }

// const styles = {
//   page: {
//     minHeight: "100vh",
//     backgroundColor: "#f4f4f4",
//     color: "#161616",
//     fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
//     display: "flex",
//     flexDirection: "column",
//   },
//   topBar: {
//     height: "48px",
//     backgroundColor: "#ffffff",
//     borderBottom: "1px solid #e0e0e0",
//     display: "flex",
//     alignItems: "center",
//     padding: "0 24px",
//     flexShrink: 0,
//   },
//   topBarLeft: {
//     display: "flex",
//     alignItems: "center",
//     gap: "16px",
//     width: "100%",
//   },
//   brand: {
//     fontSize: "16px",
//     fontWeight: "600",
//     letterSpacing: "-0.3px",
//     color: "#161616",
//   },
//   divider: {
//     width: "1px",
//     height: "24px",
//     backgroundColor: "#e0e0e0",
//   },
//   brandSub: {
//     fontSize: "14px",
//     color: "#161616",
//     flex: 1,
//   },
//   hotelLabel: {
//     fontSize: "12px",
//     color: "#6f6f6f",
//   },
//   roomTag: {
//     fontSize: "12px",
//     padding: "2px 10px",
//     backgroundColor: "#0f62fe",
//     color: "#ffffff",
//     borderRadius: "2px",
//     fontWeight: "500",
//   },
//   tabBar: {
//     height: "48px",
//     backgroundColor: "#ffffff",
//     borderBottom: "1px solid #e0e0e0",
//     display: "flex",
//     alignItems: "stretch",
//     padding: "0 8px",
//     gap: "4px",
//     flexShrink: 0,
//   },
//   tab: {
//     padding: "0 20px",
//     fontSize: "14px",
//     border: "none",
//     background: "transparent",
//     color: "#161616",
//     cursor: "pointer",
//     boxShadow: "inset 0 -2px 0 transparent",
//     transition: "all 0.15s",
//     fontFamily: "inherit",
//   },
//   tabActive: {
//     backgroundColor: "#f4f4f4",
//     boxShadow: "inset 0 -2px 0 #0f62fe",
//     fontWeight: "500",
//   },
//   content: {
//     flex: 1,
//     display: "flex",
//     flexDirection: "column",
//   },
// };

// export default App;

// import { useState, useRef } from "react";
// import ScanTab from "./components/ScanTab";
// import ChatWindow from "./components/ChatWindow";
// import { validateQR } from "./services/chatService";

// function App() {
//   const [screen, setScreen] = useState("scan");
//   const [sessionInfo, setSessionInfo] = useState(null);
//   const [validating, setValidating] = useState(false);
//   const [scanError, setScanError] = useState(null);
//   const sessionId = useRef(crypto.randomUUID());

//   const handleScanSuccess = async (hotelName, roomNo) => {
//     setValidating(true);
//     setScanError(null);
//     try {
//       const result = await validateQR(hotelName, roomNo);
//       if (result.isValid) {
//         sessionId.current = crypto.randomUUID(); // new session per scan
//         setSessionInfo(result);
//       } else {
//         setScanError(result.message || "Invalid QR code.");
//       }
//     } catch {
//       setScanError("Could not reach hotel system. Try again.");
//     } finally {
//       setValidating(false);
//     }
//   };

//   return (
//     <div style={styles.page}>

//       {/* Top bar */}
//       <div style={styles.shell}>

//         <div style={styles.topBar}>
//           <span style={styles.brand}>concierge</span>

//           {/* Center tabs */}
//           <div style={styles.tabs}>
//             {["scan", "chat"].map((key) => {
//               const label = key === "scan" ? "Scan" : "Concierge";
//               const active = screen === key;
//               const locked = key === "chat" && !sessionInfo;
//               return (
//                 <button
//                   key={key}
//                   style={{
//                     ...styles.tab,
//                     backgroundColor: active ? "#f7f7f7" : "transparent",
//                     color: active ? "#222222" : "#6a6a6a",
//                     fontWeight: active ? 600 : 500,
//                     opacity: locked ? 0.4 : 1,
//                     cursor: locked ? "not-allowed" : "pointer",
//                   }}
//                   onClick={() => !locked && setScreen(key)}
//                 >
//                   {label}
//                 </button>
//               );
//             })}
//           </div>

//           {/* Right — room info */}
//           <div style={styles.topRight}>
//             {sessionInfo && (
//               <>
//                 <span style={styles.roomLabel}>Room {sessionInfo.roomNo}</span>
//                 <div style={styles.avatar}>
//                   {sessionInfo.hotelName?.[0] || "H"}
//                 </div>
//               </>
//             )}
//           </div>
//         </div>

//         {/* Content */}
//         <div style={styles.content}>
//           {screen === "scan" && (
//             <ScanTab
//               validating={validating}
//               sessionInfo={sessionInfo}
//               scanError={scanError}
//               onScanSuccess={handleScanSuccess}
//               onEnterChat={() => setScreen("chat")}
//             />
//           )}
//           {screen === "chat" && sessionInfo && (
//             <ChatWindow
//               sessionInfo={sessionInfo}
//               sessionId={sessionId.current}
//             />
//           )}
//         </div>

//       </div>
//     </div>
//   );
// }

// const styles = {
//   page: {
//     minHeight: "100vh",
//     backgroundColor: "#f7f7f7",
//     display: "flex",
//     alignItems: "flex-start",
//     justifyContent: "center",
//     padding: "24px",
//   },
//   shell: {
//     width: "100%",
//     maxWidth: "1320px",
//     backgroundColor: "#ffffff",
//     borderRadius: "16px",
//     border: "1px solid #ebebeb",
//     boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
//     overflow: "hidden",
//     display: "flex",
//     flexDirection: "column",
//   },
//   topBar: {
//     height: "80px",
//     display: "flex",
//     alignItems: "center",
//     gap: "20px",
//     padding: "0 24px",
//     borderBottom: "1px solid #ebebeb",
//     flexShrink: 0,
//   },
//   brand: {
//     fontSize: "22px",
//     fontWeight: "700",
//     color: "#ff385c",
//     letterSpacing: "-0.4px",
//     flexShrink: 0,
//   },
//   tabs: {
//     flex: 1,
//     display: "flex",
//     alignItems: "center",
//     justifyContent: "center",
//     gap: "4px",
//   },
//   tab: {
//     height: "40px",
//     padding: "0 18px",
//     fontSize: "15px",
//     border: "none",
//     borderRadius: "999px",
//     cursor: "pointer",
//     fontFamily: "inherit",
//     transition: "all 0.15s",
//   },
//   topRight: {
//     display: "flex",
//     alignItems: "center",
//     gap: "12px",
//     flexShrink: 0,
//   },
//   roomLabel: {
//     fontSize: "14px",
//     color: "#6a6a6a",
//   },
//   avatar: {
//     width: "40px",
//     height: "40px",
//     borderRadius: "50%",
//     backgroundColor: "#f7f7f7",
//     border: "1px solid #ebebeb",
//     display: "flex",
//     alignItems: "center",
//     justifyContent: "center",
//     fontSize: "16px",
//     fontWeight: "600",
//     color: "#222222",
//     flexShrink: 0,
//   },
//   content: {
//     flex: 1,
//     display: "flex",
//     flexDirection: "column",
//   },
// };

// export default App;


import { useState, useRef } from "react";
import ScanTab from "./Components/ScanTab";
import ChatWindow from "./Components/ChatWindow";
import RequestsTab from "./Components/RequestsTab";
import FrontDeskTab from "./Components/FrontDeskTab";
import { validateQR } from "./Services/ChatService.js";

function App() {
  const [screen, setScreen] = useState("scan");
  const [sessionInfo, setSessionInfo] = useState(null);
  const [validating, setValidating] = useState(false);
  const [scanError, setScanError] = useState(null);
  const sessionId = useRef(crypto.randomUUID());

  const handleScanSuccess = async (hotelName, roomNo) => {
    setValidating(true);
    setScanError(null);
    try {
      const result = await validateQR(hotelName, roomNo);
      if (result.isValid) {
        sessionId.current = crypto.randomUUID();
        setSessionInfo(result);
      } else {
        setScanError(result.message || "Invalid QR code.");
      }
    } catch (err) {
      console.error("validateQR error:", err);
      setScanError(err.message || "Could not reach hotel system. Try again.");
    } finally {
      setValidating(false);
    }
  };

  const tabs = [
    { key: "scan", label: "Scan" },
    { key: "chat", label: "Concierge" },
    { key: "requests", label: "Requests" },
    { key: "frontdesk", label: "Front desk" },
  ];

  const locked = (key) =>
    key !== "scan" && !sessionInfo;

  return (
    <div style={styles.page}>
      <div style={styles.shell}>

        {/* Top bar */}
        <div style={styles.topBar}>
          <span style={styles.brand}>concierge</span>

          <div style={styles.tabs}>
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                style={{
                  ...styles.tab,
                  backgroundColor:
                    screen === key ? "#f7f7f7" : "transparent",
                  color: screen === key ? "#222222" : "#6a6a6a",
                  fontWeight: screen === key ? 600 : 500,
                  opacity: locked(key) ? 0.35 : 1,
                  cursor: locked(key) ? "not-allowed" : "pointer",
                }}
                onClick={() => !locked(key) && setScreen(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={styles.topRight}>
            {sessionInfo && (
              <>
                <span style={styles.roomLabel}>
                  Room {sessionInfo.roomNo}
                </span>
                <div style={styles.avatar}>
                  {sessionInfo.hotelName?.[0] || "H"}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {screen === "scan" && (
            <ScanTab
              validating={validating}
              sessionInfo={sessionInfo}
              scanError={scanError}
              onScanSuccess={handleScanSuccess}
              onEnterChat={() => setScreen("chat")}
            />
          )}
          {screen === "chat" && sessionInfo && (
            <ChatWindow
              sessionInfo={sessionInfo}
              sessionId={sessionId.current}
            />
          )}
          {screen === "requests" && sessionInfo && (
            <RequestsTab sessionInfo={sessionInfo} />
          )}
          {screen === "frontdesk" && sessionInfo && (
            <FrontDeskTab sessionInfo={sessionInfo} />
          )}
        </div>

      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f7f7f7",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "24px",
  },
  shell: {
    width: "100%",
    maxWidth: "1320px",
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #ebebeb",
    boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  topBar: {
    height: "80px",
    display: "flex",
    alignItems: "center",
    gap: "20px",
    padding: "0 24px",
    borderBottom: "1px solid #ebebeb",
    flexShrink: 0,
  },
  brand: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#ff385c",
    letterSpacing: "-0.4px",
    flexShrink: 0,
  },
  tabs: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
  },
  tab: {
    height: "40px",
    padding: "0 18px",
    fontSize: "15px",
    border: "none",
    borderRadius: "999px",
    fontFamily: "inherit",
    transition: "all 0.15s",
  },
  topRight: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexShrink: 0,
  },
  roomLabel: {
    fontSize: "14px",
    color: "#6a6a6a",
  },
  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    backgroundColor: "#f7f7f7",
    border: "1px solid #ebebeb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    fontWeight: "600",
    color: "#222222",
    flexShrink: 0,
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
};

export default App;