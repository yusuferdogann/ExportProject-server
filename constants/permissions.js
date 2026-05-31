// server/constants/permissions.js

module.exports = {
  admin: [
    // CORE
    "core:user:*",
    "core:dashboard:view",

    // FINANCE
    "finance:bank:*",

    // PRICING
    "pricing:plan:*",

    // HR
    "hr:employee:*",
  ],

  professional: [
    // REPORT
    "report:report:view",
    "report:report:create",

    // CORE
    "core:dashboard:view",

    // CALENDAR (dashboard takvim - event ekle/görüntüle/sil)
    "calendar:event:view",
    "calendar:event:create",
    "calendar:event:update",
    "calendar:event:delete",
  ],

  standard: [
    "report:report:view",
  ],

  beginner: [
    "report:report:view",
  ],

  demo: [],

  /** Kurumsal okuma / yönetici analitik paneli */
  enterprise: ["analytics:enterprise:view"],
};

// ❌ Eski
// bank.manage
// user.view

// ✅ Yeni
// finance:bank:*
// core:user:*

// ➡️ Artık:
// Modül belli (finance, core, hr)
// Resource belli (bank, user, employee)
// Aksiyon belli (view, create, *)
