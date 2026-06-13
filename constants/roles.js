/**
 * Sunucu tarafı rol sabitleri (User şeması ile aynı anahtarlar).
 */
const ROLES = {
  OWNER: "owner",
  FOREIGN_TRADE_MANAGER: "foreign_trade_manager",
  GENERAL_MANAGER: "general_manager",
  FINANCE_MANAGER: "finance_manager",
  DEMO: "demo",
  EMPLOYEE: "employee",
  ADMINISTRATOR: "administrator",
};

const ADMIN_PANEL_ROLES = [
  ROLES.OWNER,
  ROLES.FOREIGN_TRADE_MANAGER,
  ROLES.GENERAL_MANAGER,
  ROLES.FINANCE_MANAGER,
];

/** Kurumsal analitik paneli (banka / fiyatlandırma / çalışan yönetimi yok) */
const ENTERPRISE_ANALYTICS_ROLES = [ROLES.ADMINISTRATOR];

function isAdminPanelRole(role) {
  return ADMIN_PANEL_ROLES.includes(role);
}

function isEnterpriseAnalyticsRole(role) {
  return ENTERPRISE_ANALYTICS_ROLES.includes(role);
}

/** Takvimde tüm şirket etkinliklerini görmek (eski admin|owner) */
function isCalendarCompanyAdmin(role) {
  return role === ROLES.OWNER || role === ROLES.GENERAL_MANAGER;
}

/** Raporlarda yönetici görünümü (eski admin|owner) */
function isReportManagerRole(role) {
  return role === ROLES.OWNER || role === ROLES.GENERAL_MANAGER;
}

/** Yetkilendirme ağacı kökü (eski admin|owner) */
function isAuthorizationTreeAdmin(role) {
  return (
    role === ROLES.OWNER ||
    role === ROLES.GENERAL_MANAGER ||
    role === ROLES.FOREIGN_TRADE_MANAGER ||
    role === ROLES.FINANCE_MANAGER
  );
}

const COMPANY_LOGO_MANAGER_ROLES = [ROLES.OWNER, ROLES.GENERAL_MANAGER];

function canManageCompanyLogo(role) {
  return COMPANY_LOGO_MANAGER_ROLES.includes(role);
}

function canEditFacilityInfo(role) {
  return role !== ROLES.EMPLOYEE;
}

module.exports = {
  ROLES,
  ADMIN_PANEL_ROLES,
  ENTERPRISE_ANALYTICS_ROLES,
  isAdminPanelRole,
  isEnterpriseAnalyticsRole,
  isCalendarCompanyAdmin,
  isReportManagerRole,
  isAuthorizationTreeAdmin,
  COMPANY_LOGO_MANAGER_ROLES,
  canManageCompanyLogo,
  canEditFacilityInfo,
};
