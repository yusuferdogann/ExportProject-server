module.exports = function hasPermission(userPermissions, requiredPermission) {
  if (!userPermissions || userPermissions.length === 0) return false;

  return userPermissions.some((perm) => {
    // birebir eşleşme
    if (perm === requiredPermission) return true;

    // wildcard: finance:bank:*
    if (perm.endsWith(":*")) {
      const base = perm.replace(":*", "");
      return requiredPermission.startsWith(base);
    }

    return false;
  });
};
