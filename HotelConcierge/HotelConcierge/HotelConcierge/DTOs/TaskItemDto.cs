namespace HotelConcierge.DTOs
{
    public class TaskItemDto
    {
        public int TaskItemId { get; set; }
        public int HotelId { get; set; }
        public string RoomNo { get; set; } = string.Empty;
        public string Department { get; set; } = string.Empty;
        public string TaskType { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;
        public DateTime CreatedDate { get; set; }
        public DateTime? ResolvedDate { get; set; }
        public string AssignedTo { get; set; } = string.Empty;
        public int Rating { get; set; }
        public DateTime? AssignedDate { get; set; }
        public DateTime? InProgressDate { get; set; }
        public string? ExternalTaskId { get; set; }
        public string? ExternalIncidentId { get; set; }
    }

    public class UpdateTaskStatusDto
    {
        public string Status { get; set; } = string.Empty;
        public string AssignedTo { get; set; } = string.Empty;
    }

    public class RateTaskDto
    {
        public int Rating { get; set; }
    }
}
