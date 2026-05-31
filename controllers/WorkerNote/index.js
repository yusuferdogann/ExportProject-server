const WorkerNote = require("../../models/WorkerNote");

// CREATE
const createWorkerNote = async (req, res) => {
  try {
    const { title, description, status, tenantId, customerId } = req.body;

    const note = await WorkerNote.create({
      title,
      description,
      status,
      tenantId,
      customerId,
    });

    res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error) {
    console.error("CREATE WORKER NOTE ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Worker note oluşturulamadı",
      error: error.message,
    });
  }
};

// GET ALL
const getWorkerNotes = async (req, res) => {
  try {
    const { tenantId } = req.query;

    const notes = await WorkerNote.find({ tenantId }).sort({ createdDate: -1 });

    res.status(200).json({
      success: true,
      data: notes,
    });
  } catch (error) {
    console.error("GET WORKER NOTES ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Worker notes alınamadı",
      error: error.message,
    });
  }
};

// GET BY ID
const getWorkerNoteById = async (req, res) => {
  try {
    const note = await WorkerNote.findById(req.params.id);

    res.status(200).json({
      success: true,
      data: note,
    });
  } catch (error) {
    console.error("GET WORKER NOTE BY ID ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Worker note alınamadı",
      error: error.message,
    });
  }
};

// UPDATE
const updateWorkerNote = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body || {};

    const note = await WorkerNote.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Worker note bulunamadı",
      });
    }

    res.status(200).json({
      success: true,
      data: note,
    });
  } catch (error) {
    console.error("UPDATE WORKER NOTE ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Worker note güncellenemedi",
      error: error.message,
    });
  }
};

// DELETE
const deleteWorkerNote = async (req, res) => {
  try {
    const { id } = req.params;

    const note = await WorkerNote.findByIdAndDelete(id);

    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Worker note bulunamadı",
      });
    }

    res.status(200).json({
      success: true,
      message: "Worker note silindi",
    });
  } catch (error) {
    console.error("DELETE WORKER NOTE ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Worker note silinemedi",
      error: error.message,
    });
  }
};

module.exports = {
  createWorkerNote,
  getWorkerNotes,
  getWorkerNoteById,
  updateWorkerNote,
  deleteWorkerNote,
};