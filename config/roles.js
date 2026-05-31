const PERMISSIONS = require("../constants/permissions");

const adminFlat = [...new Set(Object.values(PERMISSIONS).flat())];

module.exports = {
  owner: adminFlat,
  general_manager: adminFlat,
  foreign_trade_manager: [...(PERMISSIONS.professional || [])],
  finance_manager: [
    ...(PERMISSIONS.professional || []),
    "finance:bank:*",
    "core:dashboard:view",
  ],
  demo: [
    "calendar:event:view",
    "calendar:event:create",
    "calendar:event:update",
    "calendar:event:delete",
  ],
  employee: [
    "calendar:event:view",
    "calendar:event:create",
    "calendar:event:update",
    "calendar:event:delete",
  ],
  /** Kurumsal özet: müşteri / ciro / iletişim / kullanım (salt okunur iş akışı) */
  administrator: [
    ...(PERMISSIONS.professional || []),
    ...(PERMISSIONS.enterprise || []),
  ],
};
