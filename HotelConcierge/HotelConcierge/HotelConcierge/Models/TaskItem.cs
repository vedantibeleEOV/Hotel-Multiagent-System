namespace HotelConcierge.Models
{
    public class TaskItem
    {
        public int TaskItemId { get; set; }

        public string Department { get; set; } = string.Empty;

        public string TaskType { get; set; } = string.Empty;

        public string Status { get; set; } = "Pending";
        public int HotelId { get; set; }
        public string RoomNo { get; set; } = string.Empty;    // ← add
        public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
        public string Priority { get; set; } = "Medium";      // ← add
        public DateTime? ResolvedDate { get; set; }            // ← add
        public string AssignedTo { get; set; } = string.Empty;  // ← staff name
        public int Rating { get; set; } = 0;                    // ← 1-5 star rating
        public DateTime? AssignedDate { get; set; }             // ← when assigned
        public DateTime? InProgressDate { get; set; }           // ← when started
        public string? ExternalTaskId { get; set; }
        public string? ExternalIncidentId { get; set; }
    }

}
