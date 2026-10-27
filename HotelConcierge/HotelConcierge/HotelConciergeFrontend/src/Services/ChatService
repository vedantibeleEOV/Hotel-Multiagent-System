// const BASE_URL = "https://localhost:7225/api/chat"; // ← this line is missing in your file

// export const validateQR = async (hotelName, roomNo) => {
//   try {
//     const res = await fetch(`${BASE_URL}/validate-qr`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ hotelName, roomNo }),
//     });

//     console.log("Status:", res.status);
//     console.log("Ok:", res.ok);

//     const data = await res.json();
//     console.log("Data:", data);

//     return data;
//   } catch (err) {
//     console.error("validateQR error:", err);
//     throw err;
//   }
// };

// export const sendMessage = async (message, hotelId) => {
//   const res = await fetch(BASE_URL, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ message, hotelId }),
//   });
//   if (!res.ok) throw new Error(`HTTP ${res.status}`);
//   return await res.json();
// };


//2nd
// const BASE_URL = "https://localhost:7225/api/chat";

// export const validateQR = async (hotelName, roomNo) => {
//   const res = await fetch(`${BASE_URL}/validate-qr`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ hotelName, roomNo }),
//   });
//   if (!res.ok) throw new Error("Validation failed");
//   return await res.json();
// };

// export const sendMessage = async (message, hotelId, history = []) => {
//   const res = await fetch(BASE_URL, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ message, hotelId, history }),
//   });
//   if (!res.ok) throw new Error(`HTTP ${res.status}`);
//   return await res.json();
// };

//2nd
// const BASE_URL = "https://localhost:7225/api/chat";

// export const validateQR = async (hotelName, roomNo) => {
//   const res = await fetch(`${BASE_URL}/validate-qr`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ hotelName, roomNo }),
//   });
//   if (!res.ok) throw new Error("Validation failed");
//   return await res.json();
// };

// export const sendMessage = async (
//   message, hotelId, history = [], sessionId = ""
// ) => {
//   const res = await fetch(BASE_URL, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ message, hotelId, history, sessionId }),
//   });
//   if (!res.ok) throw new Error(`HTTP ${res.status}`);
//   return await res.json();
// };


const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5141";
const BASE_URL = `${API_BASE}/api/chat`;

export const validateQR = async (hotelName, roomNo) => {
  const res = await fetch(`${BASE_URL}/validate-qr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hotelName, roomNo }),
  });
  if (!res.ok) throw new Error("Validation failed");
  return await res.json();
};

export const sendMessage = async (
  message, hotelId, history = [], sessionId = "", roomNo = ""
) => {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, hotelId, history, sessionId, roomNo }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
};