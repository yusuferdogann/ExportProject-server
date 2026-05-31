const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MessageSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "companies",
    },
    senderId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "users",
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "users",
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    label: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

const MessageModel = mongoose.model("messages", MessageSchema);
module.exports = MessageModel;
