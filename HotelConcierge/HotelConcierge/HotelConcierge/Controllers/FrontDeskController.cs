using HotelConcierge.API.Data;
using HotelConcierge.DTOs;
using HotelConcierge.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelConcierge.Controllers
{
    [ApiController]
    [Route("api/frontdesk")]
    public class FrontDeskController : ControllerBase
    {
        private readonly HotelDbContext _context;

        public FrontDeskController(HotelDbContext context)
        {
            _context = context;
        }

        // Guest sends message to front desk
        [HttpPost("send")]
        public async Task<IActionResult> SendMessage(
            SendFrontDeskMessageDto request)
        {
            var msg = new FrontDeskMessage
            {
                HotelId = request.HotelId,
                RoomNo = request.RoomNo,
                GuestMessage = request.Message,
                CreatedDate = DateTime.UtcNow
            };

            _context.FrontDeskMessages.Add(msg);
            await _context.SaveChangesAsync();

            return Ok(new FrontDeskMessageDto
            {
                Id = msg.Id,
                HotelId = msg.HotelId,
                RoomNo = msg.RoomNo,
                GuestMessage = msg.GuestMessage,
                IsRead = msg.IsRead,
                IsReplied = msg.IsReplied,
                CreatedDate = msg.CreatedDate
            });
        }

        // Get all messages for a hotel (staff view)
        [HttpGet("{hotelId}")]
        public async Task<IActionResult> GetMessages(int hotelId)
        {
            var messages = await _context.FrontDeskMessages
                .Where(m => m.HotelId == hotelId)
                .OrderByDescending(m => m.CreatedDate)
                .Select(m => new FrontDeskMessageDto
                {
                    Id = m.Id,
                    HotelId = m.HotelId,
                    RoomNo = m.RoomNo,
                    GuestMessage = m.GuestMessage,
                    StaffReply = m.StaffReply,
                    IsRead = m.IsRead,
                    IsReplied = m.IsReplied,
                    CreatedDate = m.CreatedDate,
                    RepliedDate = m.RepliedDate
                })
                .ToListAsync();

            return Ok(messages);
        }

        // Get messages for a specific room (guest view)
        [HttpGet("{hotelId}/room/{roomNo}")]
        public async Task<IActionResult> GetRoomMessages(
            int hotelId, string roomNo)
        {
            var messages = await _context.FrontDeskMessages
                .Where(m => m.HotelId == hotelId && m.RoomNo == roomNo)
                .OrderByDescending(m => m.CreatedDate)
                .Select(m => new FrontDeskMessageDto
                {
                    Id = m.Id,
                    RoomNo = m.RoomNo,
                    GuestMessage = m.GuestMessage,
                    StaffReply = m.StaffReply,
                    IsRead = m.IsRead,
                    IsReplied = m.IsReplied,
                    CreatedDate = m.CreatedDate,
                    RepliedDate = m.RepliedDate
                })
                .ToListAsync();

            return Ok(messages);
        }

        // Staff replies to a message
        [HttpPatch("{messageId}/reply")]
        public async Task<IActionResult> Reply(
            int messageId, ReplyFrontDeskDto request)
        {
            var msg = await _context.FrontDeskMessages
                .FirstOrDefaultAsync(m => m.Id == messageId);

            if (msg == null) return NotFound();

            msg.StaffReply = request.Reply;
            msg.IsReplied = true;
            msg.IsRead = true;
            msg.RepliedDate = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            return Ok(new FrontDeskMessageDto
            {
                Id = msg.Id,
                RoomNo = msg.RoomNo,
                GuestMessage = msg.GuestMessage,
                StaffReply = msg.StaffReply,
                IsRead = msg.IsRead,
                IsReplied = msg.IsReplied,
                CreatedDate = msg.CreatedDate,
                RepliedDate = msg.RepliedDate
            });
        }

        // Mark message as read
        [HttpPatch("{messageId}/read")]
        public async Task<IActionResult> MarkRead(int messageId)
        {
            var msg = await _context.FrontDeskMessages
                .FirstOrDefaultAsync(m => m.Id == messageId);

            if (msg == null) return NotFound();

            msg.IsRead = true;
            await _context.SaveChangesAsync();

            return Ok();
        }
    }
}
