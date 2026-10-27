const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5141";
const BASE_URL = `${API_BASE}/api/frontdesk`;

export const sendFrontDeskMessage = async (hotelId, roomNo, message) => {
  const res = await fetch(`${BASE_URL}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hotelId, roomNo, message }),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return await res.json();
};

export const getRoomMessages = async (hotelId, roomNo) => {
  const res = await fetch(`${BASE_URL}/${hotelId}/room/${roomNo}`);
  if (!res.ok) throw new Error("Failed to fetch messages");
  return await res.json();
};