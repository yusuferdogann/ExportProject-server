const CalendarEvent = require("../../models/CalendarEvents");
const User = require("../../models/User");
const { isCalendarCompanyAdmin } = require("../../constants/roles");

// CREATE
const createEvent = async (req, res) => {
  try {
    const { companyId, id: userId, name } = req.user;
    const { title, description, date, startDate, endDate, assignedTo, assignedToName } = req.body;
    const start = startDate ? new Date(startDate) : (date ? new Date(date) : new Date());
    const end = endDate ? new Date(endDate) : null;

    const targetId = assignedTo || userId;
    const targetName = assignedToName ?? req.user.name ?? "Ben";

    const event = await CalendarEvent.create({
      title,
      description,
      date: start,
      startDate: start,
      endDate: end,
      tenantId: companyId,
      customerId: userId,
      assignedTo: targetId,
      assignedToName: targetName,
      creatorName: name || "Yönetici",
    });

    res.status(201).json({
      success: true,
      data: event,
    });
  } catch (error) {
    console.error("CREATE EVENT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Event oluşturulamadı",
      error: error.message,
    });
  }
};

// GET ALL - Admin: tüm şirket | Çalışan: sadece kendine atananlar
const getEvents = async (req, res) => {
  try {
    const { companyId, id: userId, role } = req.user;
    const isAdmin = isCalendarCompanyAdmin(role);

    const query = { tenantId: companyId };
    if (!isAdmin) {
      query.assignedTo = userId;
    }

    const events = await CalendarEvent.find(query).sort({ date: 1 });

    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error) {
    console.error("GET EVENTS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Eventler alınamadı",
      error: error.message,
    });
  }
};

// GET /api/calendar/assignable-users - Takvim için atanabilecek kullanıcılar (çalışanlar)
const getAssignableUsers = async (req, res) => {
  try {
    const { companyId, id: currentUserId } = req.user;
    const users = await User.find({ companyId })
      .select("_id username email")
      .lean();
    const list = users
      .filter((u) => String(u._id) !== String(currentUserId))
      .map((u) => ({
        _id: u._id.toString(),
        name: u.username || u.email || "İsimsiz",
        email: u.email || "",
      }));
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    console.error("GET ASSIGNABLE USERS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Kullanıcılar alınamadı",
      error: error.message,
    });
  }
};

// DELETE
const deleteEvent = async (req, res) => {
  try {
    await CalendarEvent.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Event silindi",
    });
  } catch (error) {
    console.error("DELETE EVENT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Event silinemedi",
      error: error.message,
    });
  }
};

module.exports = {
  createEvent,
  getEvents,
  deleteEvent,
  getAssignableUsers,
};