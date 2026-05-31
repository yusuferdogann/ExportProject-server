const jwt = require("jsonwebtoken");
const { resolveUserContext } = require("../helpers/authorization/resolveUserContext");

const socketAuthMiddleware = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization?.split(" ")[1] || null);

    if (!token) {
      return next(new Error("Authentication error: token missing"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    const ctx = await resolveUserContext(decoded);

    const pgId = ctx.pgId || (ctx.src === "pg" ? ctx.id : null);
    const mongoId = ctx.id;

    if (!pgId && !mongoId) {
      return next(new Error("Authentication error: user not found"));
    }

    socket.user = {
      id: mongoId || pgId,
      pgId: pgId || mongoId,
      role: ctx.role,
    };

    socket.tenantId = ctx.companyPgId || ctx.companyId;

    next();
  } catch (err) {
    console.error("❌ Authentication error:", err.message);
    next(new Error("Authentication error: invalid token"));
  }
};

module.exports = socketAuthMiddleware;
