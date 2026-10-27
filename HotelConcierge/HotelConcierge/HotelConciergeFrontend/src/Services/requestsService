// const BASE_URL = "https://localhost:7225/api/requests";

// export const getRequests = async (hotelId, status = null) => {
//   const url = status
//     ? `${BASE_URL}/${hotelId}?status=${status}`
//     : `${BASE_URL}/${hotelId}`;
//   const res = await fetch(url);
//   if (!res.ok) throw new Error("Failed to fetch requests");
//   return await res.json();
// };

// export const updateRequestStatus = async (taskId, status) => {
//   const res = await fetch(`${BASE_URL}/${taskId}/status`, {
//     method: "PATCH",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ status }),
//   });
//   if (!res.ok) throw new Error("Failed to update status");
//   return await res.json();
// };

//2nd
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5141";
const BASE_URL = `${API_BASE}/api/requests`;

// Guest — get their room's requests
export const getRoomRequests = async (hotelId, roomNo) => {
  const res = await fetch(`${BASE_URL}/${hotelId}/room/${roomNo}`);
  if (!res.ok) throw new Error("Failed to fetch");
  return await res.json();
};

// Staff — get all hotel requests
export const getRequests = async (hotelId, status = null) => {
  const url = status
    ? `${BASE_URL}/${hotelId}?status=${status}`
    : `${BASE_URL}/${hotelId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return await res.json();
};

export const updateRequestStatus = async (taskId, status, assignedTo = "") => {
  const res = await fetch(`${BASE_URL}/${taskId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, assignedTo }),
  });
  if (!res.ok) throw new Error("Failed to update");
  return await res.json();
};

export const rateRequest = async (taskId, rating) => {
  const res = await fetch(`${BASE_URL}/${taskId}/rate`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  if (!res.ok) throw new Error("Failed to rate");
  return await res.json();
};