const CustomError = require("../../helpers/error/CustomError");

const customErrorHandler = (err, req, res, next) => {
  let customError = err;

  if (err.name === "SyntaxError") {
    customError = new CustomError("Unexpected Syntax", 400);
  }

  if (err.name === "ValidationError") {
    customError = new CustomError(err.message, 400);
  }

  if (err.code === 11000) {
    customError = new CustomError("Bu kayıt zaten mevcut (duplicate key).", 400);
  }

  if (err.name === "CastError" && err.kind === "ObjectId") {
    customError = new CustomError(
      "Gecersiz kullanici veya sirket kimligi. Cikis yapip tekrar giris yapin.",
      400
    );
  }

  if (
    err.name === "MongooseError" ||
    (err.message && String(err.message).includes("buffering timed out"))
  ) {
    customError = new CustomError(
      "Veritabani baglantisi yok. MongoDB erisilemiyor.",
      503
    );
  }

  const statusCode =
    customError instanceof CustomError
      ? customError.status
      : customError.status || 500;

  if (!(customError instanceof CustomError) && statusCode >= 500) {
    console.error("[api]", req.method, req.originalUrl, err.message || err);
  }

  res.status(statusCode).json({
    success: false,
    message: customError.message || "Internal Server Error",
  });
};

module.exports = customErrorHandler;
