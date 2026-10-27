using HotelConcierge.API.Data;
using Microsoft.EntityFrameworkCore;

namespace HotelConcierge.Service
{
    public class TaskStatusSyncWorker : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly IConfiguration _configuration;
        private readonly ILogger<TaskStatusSyncWorker> _logger;

        public TaskStatusSyncWorker(
            IServiceProvider serviceProvider,
            IConfiguration configuration,
            ILogger<TaskStatusSyncWorker> logger)
        {
            _serviceProvider = serviceProvider;
            _configuration = configuration;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await SyncTaskStatusesAsync(stoppingToken);
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogWarning(ex, "Unexpected error in TaskStatusSyncWorker execution cycle.");
                }

                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }

        private async Task SyncTaskStatusesAsync(CancellationToken stoppingToken)
        {
            var enabled = _configuration.GetValue<bool?>("VoyageOps:Enabled") ?? true;
            if (!enabled)
            {
                return;
            }

            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<HotelDbContext>();
            var voyageOpsClient = scope.ServiceProvider.GetRequiredService<IVoyageOpsClient>();

            var tasks = await context.Tasks
                .Where(t => t.ExternalTaskId != null && t.Status != "Resolved")
                .ToListAsync(stoppingToken);

            if (tasks.Count == 0)
            {
                // Skip the cycle quietly when no tasks need syncing
                return;
            }

            foreach (var task in tasks)
            {
                if (stoppingToken.IsCancellationRequested)
                    break;

                try
                {
                    _logger.LogDebug("Polling status for Task {TaskItemId} (ExternalTaskId: {ExternalTaskId}).", task.TaskItemId, task.ExternalTaskId);

                    var externalStatus = await voyageOpsClient.GetTaskStatusAsync(task.ExternalTaskId!);
                    if (externalStatus == null)
                    {
                        continue;
                    }

                    if (string.Equals(externalStatus.Status, "NOT_FOUND", StringComparison.OrdinalIgnoreCase))
                    {
                        _logger.LogDebug(
                            "Task {TaskItemId} (ExternalTaskId: {ExternalTaskId}) no longer exists in VoyageOps (404). Stopping polling.",
                            task.TaskItemId,
                            task.ExternalTaskId);
                        task.ExternalTaskId = null;
                        await context.SaveChangesAsync(stoppingToken);
                        continue;
                    }

                    var oldStatus = task.Status;
                    var hasChanged = false;
                    var now = DateTime.UtcNow;

                    switch (externalStatus.Status?.ToUpperInvariant())
                    {
                        case "PENDING":
                            if (task.Status != "Pending")
                            {
                                task.Status = "Pending";
                                hasChanged = true;
                            }
                            break;

                        case "ASSIGNED":
                            if (task.Status != "Assigned")
                            {
                                task.Status = "Assigned";
                                hasChanged = true;
                            }
                            if (!string.IsNullOrWhiteSpace(externalStatus.AssignedStaffName) && task.AssignedTo != externalStatus.AssignedStaffName)
                            {
                                task.AssignedTo = externalStatus.AssignedStaffName;
                                hasChanged = true;
                            }
                            if (task.AssignedDate == null)
                            {
                                task.AssignedDate = now;
                                hasChanged = true;
                            }
                            break;

                        case "IN_PROGRESS":
                            if (task.Status != "InProgress")
                            {
                                task.Status = "InProgress";
                                hasChanged = true;
                            }
                            if (!string.IsNullOrWhiteSpace(externalStatus.AssignedStaffName) && task.AssignedTo != externalStatus.AssignedStaffName)
                            {
                                task.AssignedTo = externalStatus.AssignedStaffName;
                                hasChanged = true;
                            }
                            if (task.AssignedDate == null)
                            {
                                task.AssignedDate = now;
                                hasChanged = true;
                            }
                            if (task.InProgressDate == null)
                            {
                                task.InProgressDate = externalStatus.StartedAt != null
                                    ? EnsureUtc(externalStatus.StartedAt.Value)
                                    : now;
                                hasChanged = true;
                            }
                            break;

                        case "COMPLETED":
                            if (task.Status != "Resolved")
                            {
                                task.Status = "Resolved";
                                hasChanged = true;
                            }
                            if (task.AssignedDate == null)
                            {
                                task.AssignedDate = now;
                                hasChanged = true;
                            }
                            if (task.InProgressDate == null)
                            {
                                task.InProgressDate = now;
                                hasChanged = true;
                            }
                            if (task.ResolvedDate == null)
                            {
                                task.ResolvedDate = now;
                                hasChanged = true;
                            }
                            break;

                        case "ON_HOLD":
                        case "CANCELLED":
                        default:
                            // change nothing
                            break;
                    }

                    if (hasChanged)
                    {
                        await context.SaveChangesAsync(stoppingToken);

                        if (oldStatus != task.Status)
                        {
                            _logger.LogDebug(
                                "Task {TaskItemId} status changed from '{OldStatus}' to '{NewStatus}'.",
                                task.TaskItemId,
                                oldStatus,
                                task.Status);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Failed to sync status for Task {TaskItemId} (ExternalTaskId: {ExternalTaskId}).", task.TaskItemId, task.ExternalTaskId);
                }
            }
        }

        private static DateTime EnsureUtc(DateTime dt)
        {
            return dt.Kind switch
            {
                DateTimeKind.Utc => dt,
                DateTimeKind.Local => dt.ToUniversalTime(),
                _ => DateTime.SpecifyKind(dt, DateTimeKind.Utc)
            };
        }
    }
}
