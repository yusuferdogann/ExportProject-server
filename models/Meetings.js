const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MeetsSchema = new Schema(
    {
        companyId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "company",
        },
        customerId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: "customers",
        },
        firmName: {
            type: String,
            required: true,
            trim: true,
        },
        mail: {
            type: String,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        status: {
            type: String,
            required: true
        },
        title: {
            type: String,
            trim: true,
            default: "",
        },
        meetDate: {
            type: Date,
        },
        noteDetail: {
            type: String,
            trim: true,
            default: "",
        },
        recordDate: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
);

const MeetsModel = mongoose.model("meeties", MeetsSchema);
module.exports = MeetsModel;