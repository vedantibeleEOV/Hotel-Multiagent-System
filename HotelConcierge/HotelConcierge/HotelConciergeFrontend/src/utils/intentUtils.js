// export function detectIntent(reply) {
//   const r = reply.toLowerCase();
//   if (r.includes("maintenance") || r.includes("notified our maintenance"))
//     return "maintenance";
//   if (r.includes("housekeeping") || r.includes("towel"))
//     return "housekeeping";
//   if (
//     r.includes("timing") || r.includes("wifi") ||
//     r.includes("pool") || r.includes("gym") ||
//     r.includes("breakfast") || r.includes("lunch") ||
//     r.includes("check-in") || r.includes("check-out")
//   ) return "amenity";
//   if (r.includes("nearby") || r.includes("attraction") || r.includes("visit"))
//     return "attraction";
//   return "general";
// }

// export const INTENT_CONFIG = {
//   maintenance:  { label: "Maintenance",   icon: "🔧", color: "#fee2e2", textColor: "#991b1b" },
//   housekeeping: { label: "Housekeeping",  icon: "🏠", color: "#dcfce7", textColor: "#166534" },
//   amenity:      { label: "Amenity info",  icon: "🕐", color: "#dbeafe", textColor: "#1e40af" },
//   attraction:   { label: "Local info",    icon: "📍", color: "#ede9fe", textColor: "#5b21b6" },
//   general:      { label: "General",       icon: "💬", color: "#f3f4f6", textColor: "#374151" },
// };

// // Dynamic chips based on what hotel actually has in DB
// export function buildChips(hotel) {
//   if (!hotel) return [];

//   const chips = [];

//   if (hotel.lunchTime)        chips.push("What is the lunch timing?");
//   if (hotel.breakfastTime)    chips.push("What is the breakfast timing?");
//   if (hotel.gymTiming)        chips.push("What are the gym hours?");
//   if (hotel.poolTiming)       chips.push("What is the pool timing?");
//   if (hotel.wifiPassword)     chips.push("What is the WiFi password?");
//   if (hotel.checkInTime)      chips.push("What is the check-in time?");
//   if (hotel.checkOutTime)     chips.push("What is the check-out time?");
//   if (hotel.restaurantTiming) chips.push("What are the restaurant hours?");

//   // These are always relevant
//   chips.push("AC is not working in my room");
//   chips.push("I need extra towels");
//   chips.push("Nearby places to visit?");

//   return chips;
// }


export function detectIntent(reply) {
  const r = reply.toLowerCase();
  if (r.includes("maintenance") || r.includes("notified our maintenance"))
    return "maintenance";
  if (r.includes("housekeeping") || r.includes("towel"))
    return "housekeeping";
  if (
    r.includes("timing") || r.includes("wifi") ||
    r.includes("pool") || r.includes("gym") ||
    r.includes("breakfast") || r.includes("lunch") ||
    r.includes("check-in") || r.includes("check-out")
  ) return "amenity";
  if (r.includes("nearby") || r.includes("attraction") || r.includes("visit"))
    return "attraction";
  return "general";
}

export const INTENT_CONFIG = {
  maintenance:  { label: "Maintenance",  icon: "🔧", color: "#fee2e2", textColor: "#991b1b" },
  housekeeping: { label: "Housekeeping", icon: "🏠", color: "#dcfce7", textColor: "#166534" },
  amenity:      { label: "Amenity info", icon: "🕐", color: "#dbeafe", textColor: "#1e40af" },
  attraction:   { label: "Local info",   icon: "📍", color: "#ede9fe", textColor: "#5b21b6" },
  general:      { label: "General",      icon: "💬", color: "#f3f4f6", textColor: "#374151" },
};

export function buildChips(hotel) {
  if (!hotel) return [];
  const chips = [];

  // Match exact casing from backend QRValidationResponseDto
  if (hotel.lunchTime || hotel.LunchTime)
    chips.push("What is the lunch timing?");
  if (hotel.breakfastTime || hotel.BreakfastTime)
    chips.push("What is the breakfast timing?");
  if (hotel.gymTiming || hotel.GymTiming)
    chips.push("What are the gym hours?");
  if (hotel.poolTiming || hotel.PoolTiming)
    chips.push("What is the pool timing?");
  if (hotel.wifiPassword || hotel.WifiPassword)
    chips.push("What is the WiFi password?");
  if (hotel.checkInTime || hotel.CheckInTime)
    chips.push("What is the check-in time?");
  if (hotel.checkOutTime || hotel.CheckOutTime)
    chips.push("What is the check-out time?");
  if (hotel.restaurantTiming || hotel.RestaurantTiming)
    chips.push("What are the restaurant hours?");

  chips.push("AC is not working in my room");
  chips.push("I need extra towels");
  chips.push("Nearby places to visit?");

  return chips;
}