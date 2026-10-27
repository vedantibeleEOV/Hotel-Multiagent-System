namespace HotelConcierge.Service
{
    public class VoyageOpsResult
    {
        public string? IncidentId { get; set; }
        public string? OperationalTaskId { get; set; }
        public string? Category { get; set; }
        public string? Severity { get; set; }
        public string? TechnicianName { get; set; }
        public int? SlaMinutes { get; set; }
        public string? AssignedStaffName { get; set; }
        public string? TaskStatus { get; set; }
        public string? Decision { get; set; }
        public string? GuestMessage { get; set; }
        public string? Item { get; set; }
        public int? Quantity { get; set; }
    }

    public class VoyageOpsTaskStatus
    {
        public string Status { get; set; } = string.Empty;
        public string? AssignedStaffName { get; set; }
        public DateTime? StartedAt { get; set; }
    }

    public class EarlyCheckInResult
    {
        public string? Decision { get; set; }
        public string? Reason { get; set; }
        public string? GuestMessage { get; set; }
        public string? RequestedTime { get; set; }
        public string? ReadyBy { get; set; }
        public string? RoomNumber { get; set; }
    }

    public interface IVoyageOpsClient
    {
        Task<VoyageOpsResult?> ReportMaintenanceIssueAsync(string roomNo, string guestMessage);
        Task<VoyageOpsResult?> ReportHousekeepingRequestAsync(string roomNo, string guestMessage);
        Task<VoyageOpsTaskStatus?> GetTaskStatusAsync(string externalTaskId);
        Task<EarlyCheckInResult?> PostEarlyCheckInAsync(string roomNo, string message);
    }
}
