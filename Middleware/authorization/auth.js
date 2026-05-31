const CustomError = require("../../helpers/error/CustomError");
const jwt = require("jsonwebtoken");
const { isTokenIncluded } = require("../../helpers/authorization/tokenHelpers");
const { getAccessTokenFromHeader } = require("../../helpers/authorization/tokenHelpers");
const {
  resolveUserContext,
  isMongoConnected,
  MONGO_ID_RE,
} = require("../../helpers/authorization/resolveUserContext");

const getAccessToRoute = (req, res, next) => {
  const { JWT_SECRET_KEY } = process.env;

  if (!isTokenIncluded(req)) {
    return next(new CustomError("You are not authorized to access this route", 401));
  }

  const accessToken = getAccessTokenFromHeader(req);

  jwt.verify(accessToken, JWT_SECRET_KEY, async (err, decoded) => {
    if (err) {
      return next(new CustomError("You are not authorized to access this route", 401));
    }

    try {
      req.user = await resolveUserContext(decoded);

      if (
        (req.user.src === "pg" || !MONGO_ID_RE.test(req.user.id)) &&
        !isMongoConnected()
      ) {
        req.user.mongoUnavailable = true;
      }

      return next();
    } catch (e) {
      console.error("[auth] context:", e.message);
      return next(new CustomError("Oturum cozumlenemedi", 500));
    }
  });
};

module.exports = {
  getAccessToRoute,
};
