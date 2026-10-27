using HotelConcierge.API.Data;
using HotelConcierge.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelConcierge.Controllers
{
    [ApiController]
    [Route("api/requests")]
    public class RequestsController : ControllerBase
    {
        private readonly HotelDbContext _context;

        public RequestsController(HotelDbContext context)
        {
            _context = context;
        }

        //// Get all requests for a hotel
        //[HttpGet("{hotelId}")]
        //public async Task<IActionResult> GetRequests(
        //    int hotelId,
        //    [FromQuery] string? status = null)
        //{
        //    var query = _context.Tasks
        //        .Where(t => t.HotelId == hotelId);

        //    if (!string.IsNullOrEmpty(status))
        //        query = query.Where(t => t.Status == status);

        //    var tasks = await query
        //        .OrderByDescending(t => t.CreatedDate)
        //        .Select(t => new TaskItemDto
        //        {
        //            TaskItemId = t.TaskItemId,
        //            HotelId = t.HotelId,
        //            RoomNo = t.RoomNo,
        //            Department = t.Department,
        //            TaskType = t.TaskType,
        //            Status = t.Status,
        //            Priority = t.Priority,
        //            CreatedDate = t.CreatedDate,
        //            ResolvedDate = t.ResolvedDate
        //        })
        //        .ToListAsync();

        //    return Ok(tasks);
        //}

        //// Update request status
        //[HttpPatch("{taskId}/status")]
        //public async Task<IActionResult> UpdateStatus(
        //    int taskId,
        //    UpdateTaskStatusDto request)
        //{
        //    var task = await _context.Tasks
        //        .FirstOrDefaultAsync(t => t.TaskItemId == taskId);

        //    if (task == null)
        //        return NotFound();

        //    task.Status = request.Status;

        //    if (request.Status == "Resolved")
        //        task.ResolvedDate = DateTime.UtcNow;

        //    await _context.SaveChangesAsync();

        //    return Ok(new TaskItemDto
        //    {
        //        TaskItemId = task.TaskItemId,
        //        HotelId = task.HotelId,
        //        RoomNo = task.RoomNo,
        //        Department = task.Department,
        //        TaskType = task.TaskType,
        //        Status = task.Status,
        //        Priority = task.Priority,
        //        CreatedDate = task.CreatedDate,
        //        ResolvedDate = task.ResolvedDate
        //    });
        //}

        // Guest view — get requests for a specific room
        [HttpGet("{hotelId}/room/{roomNo}")]
        public async Task<IActionResult> GetRoomRequests(
      int hotelId, string roomNo)
        {
            var tasks = await _context.Tasks
                .Where(t => t.HotelId == hotelId && t.Status != "Escalated") //&& t.RoomNo == roomNo
                .OrderByDescending(t => t.CreatedDate)
                .Select(t => new TaskItemDto
                {
                    TaskItemId = t.TaskItemId,
                    HotelId = t.HotelId,
                    RoomNo = t.RoomNo,
                    Department = t.Department,
                    TaskType = t.TaskType,
                    Status = t.Status,
                    Priority = t.Priority,
                    AssignedTo = t.AssignedTo,
                    Rating = t.Rating,
                    CreatedDate = t.CreatedDate,
                    AssignedDate = t.AssignedDate,
                    InProgressDate = t.InProgressDate,
                    ResolvedDate = t.ResolvedDate,
                    ExternalTaskId = t.ExternalTaskId,
                    ExternalIncidentId = t.ExternalIncidentId
                })
                .ToListAsync();
            //        var tasks = await _context.Tasks
            //.Where(t => t.HotelId == hotelId)
            //.OrderByDescending(t => t.CreatedDate)
            //.Select(t => new TaskItemDto
            //{
            //    TaskItemId = t.TaskItemId,
            //    HotelId = t.HotelId,
            //    RoomNo = t.RoomNo,
            //    Department = t.Department,
            //    TaskType = t.TaskType,
            //    Status = t.Status,
            //    Priority = t.Priority,
            //    AssignedTo = t.AssignedTo,
            //    Rating = t.Rating,
            //    CreatedDate = t.CreatedDate,
            //    AssignedDate = t.AssignedDate,
            //    InProgressDate = t.InProgressDate,
            //    ResolvedDate = t.ResolvedDate
            //})
            //.ToListAsync();

            return Ok(tasks);
        }

        //Staff view get all requests for hotel
        [HttpGet("{hotelId}")]
        public async Task <IActionResult>GetRequest(int hotelId, [FromQuery] string? status = null)
        {
            var query = _context.Tasks.Where(t => t.HotelId == hotelId);

            if (!string.IsNullOrEmpty(status))
                query = query.Where(t => t.Status == status);

            var tasks = await query
                 .OrderByDescending(t => t.CreatedDate)
                 .Select(t => new TaskItemDto
                 {
                     TaskItemId = t.TaskItemId,
                     HotelId = t.HotelId,
                     RoomNo = t.RoomNo,
                     Department = t.Department,
                     TaskType = t.TaskType,
                     Status = t.Status,
                     Priority = t.Priority,
                     AssignedTo = t.AssignedTo,
                     Rating = t.Rating,
                     CreatedDate = t.CreatedDate,
                     AssignedDate = t.AssignedDate,
                     InProgressDate = t.InProgressDate,
                     ResolvedDate = t.ResolvedDate,
                     ExternalTaskId = t.ExternalTaskId,
                     ExternalIncidentId = t.ExternalIncidentId
                 })
                 .ToListAsync();

            return Ok(tasks);
        }

        // Update status — advances the timeline
        [HttpPatch("{taskId}/status")]
        public async Task<IActionResult> UpdateStatus(
            int taskId, UpdateTaskStatusDto request)
        {
            var task = await _context.Tasks
                .FirstOrDefaultAsync(t => t.TaskItemId == taskId);

            if (task == null) return NotFound();

            task.Status = request.Status;

            if (!string.IsNullOrEmpty(request.AssignedTo))
                task.AssignedTo = request.AssignedTo;

            switch (request.Status)
            {
                case "Assigned":
                    task.AssignedDate = DateTime.UtcNow;
                    break;
                case "InProgress":
                    if (task.AssignedDate == null)
                        task.AssignedDate = DateTime.UtcNow;
                    task.InProgressDate = DateTime.UtcNow;
                    break;
                case "Resolved":
                    if (task.AssignedDate == null)
                        task.AssignedDate = DateTime.UtcNow;
                    if (task.InProgressDate == null)
                        task.InProgressDate = DateTime.UtcNow;
                    task.ResolvedDate = DateTime.UtcNow;
                    break;
            }

            await _context.SaveChangesAsync();

            return Ok(new TaskItemDto
            {
                TaskItemId = task.TaskItemId,
                HotelId = task.HotelId,
                RoomNo = task.RoomNo,
                Department = task.Department,
                TaskType = task.TaskType,
                Status = task.Status,
                Priority = task.Priority,
                AssignedTo = task.AssignedTo,
                Rating = task.Rating,
                CreatedDate = task.CreatedDate,
                AssignedDate = task.AssignedDate,
                InProgressDate = task.InProgressDate,
                ResolvedDate = task.ResolvedDate,
                ExternalTaskId = task.ExternalTaskId,
                ExternalIncidentId = task.ExternalIncidentId
            });
        }

        // Guest submits star rating
        [HttpPatch("{taskId}/rate")]
        public async Task<IActionResult> Rate(
            int taskId, RateTaskDto request)
        {
            var task = await _context.Tasks
                .FirstOrDefaultAsync(t => t.TaskItemId == taskId);

            if (task == null) return NotFound();
            if (task.Status != "Resolved")
                return BadRequest("Can only rate resolved tasks.");

            task.Rating = request.Rating;
            await _context.SaveChangesAsync();

            return Ok();
        }
    }
}
