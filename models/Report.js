const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Rapor türleri:
// - employee: Çalışan raporları (çalışan → yönetici gönderimi)
// - monthly: Aylık sistem raporu (otomatik üretim)
// - weekly: Haftalık sistem raporu
// - tracking: Çalışan takip raporu (aktivite özeti)

const ReportSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "companies", required: true },
    tenantId: { type: String, trim: true },

    type: {
      type: String,
      enum: ["employee", "monthly", "weekly", "tracking"],
      required: true,
    },

    reportNo: { type: String, required: true, trim: true },
    reportType: { type: String, required: true, trim: true }, // örn. "Çalışan Raporu", "Aylık Özet"

    senderId: { type: Schema.Types.ObjectId, ref: "users" },
    sender: { type: String, trim: true },
    senderRole: { type: String, trim: true },

    createdAt: { type: Date, default: Date.now },

    periodStart: { type: Date },
    periodEnd: { type: Date },
    reportPeriod: { type: String, trim: true }, // örn. "Ağustos 2025"

    status: { type: String, trim: true, default: "Hazır" },

    reviewerId: { type: Schema.Types.ObjectId, ref: "users" },
    reviewer: { type: String, trim: true },
    reviewDate: { type: Date },

    viewStatus: { type: String, trim: true, default: "Görülmedi" },

    fileType: { type: String, trim: true, default: "PDF" },
    fileUrl: { type: String, trim: true },

    title: { type: String, trim: true },
    contentHTML: { type: String, default: "" },

    // CKEditor içinden gelen resim URL'leri (Cloudinary)
    images: { type: [String], default: [] },

    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

ReportSchema.index({ companyId: 1, type: 1, createdAt: -1 });
ReportSchema.index({ companyId: 1, reportNo: 1 }, { unique: true });

module.exports = mongoose.model("reports", ReportSchema);