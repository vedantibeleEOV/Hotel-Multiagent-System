using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelConcierge.Migrations
{
    /// <inheritdoc />
    public partial class AddExternalTaskId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExternalIncidentId",
                table: "Tasks",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExternalTaskId",
                table: "Tasks",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ExternalIncidentId",
                table: "Tasks");

            migrationBuilder.DropColumn(
                name: "ExternalTaskId",
                table: "Tasks");
        }
    }
}
