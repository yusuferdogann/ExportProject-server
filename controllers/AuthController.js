const Usermodels = require("../models/User");
const ScopeModel = require("../models/scopes");
const mongoose = require("mongoose");
const Company = require("../models/Company");
const express = require("express");
const CustomError = require("../helpers/error/CustomError");
const FacilityModel = require("../models/facility")
const asyncErrorWrapper = require("express-async-handler");
const { sendJwtToClient, getAccessTokenFromHeader } = require("../helpers/authorization/tokenHelpers");
const {
  validateUserInput,
  comparePassword,
} = require("../helpers/input/inputHelpers");

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// const register = asyncErrorWrapper(async (req, res, next) => {
//   const { username, email, password } = req.body;

//   const user = await Usermodels.create({
//     username,
//     email,
//     password,
//   });
//   sendJwtToClient(user, res);
// });


const register = asyncErrorWrapper(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { username, email, password } = req.body;

    // 🔑 SUBDOMAIN'DEN SLUG ÇIKAR
    const hostname =
      req.headers["x-forwarded-host"] || req.hostname;

    const slug =
      req.headers["x-tenant"] ||
      req.headers["x-forwarded-host"]?.split(".")[0] ||
      req.hostname.split(".")[0];

    const effectiveSlug = !slug || slug === "localhost" ? "default" : slug;

    if (!effectiveSlug) {
      return res.status(400).json({
        success: false,
        message: "Geçersiz tenant"
      });
    }



    // 🔍 COMPANY VAR MI KONTROLÜ
    let company = await Company.findOne({ slug: effectiveSlug }).session(session);

    // 🆕 YOKSA OLUŞTUR
    if (!company) {
      company = await Company.create(
        [{
          name: effectiveSlug,
          slug: effectiveSlug,
          isActive: true
        }],
        { session }
      );
      company = company[0];
    }

    // 👑 OWNER USER OLUŞTUR
    const user = await Usermodels.create(
      [{
        username,
        email,
        password,
        role: "owner",
        companyId: company._id
      }],
      { session }
    );

    await session.commitTransaction();

    sendJwtToClient(user[0], res);

  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});




const login = asyncErrorWrapper(async (req, res, next) => {
  const { email: rawEmail, password } = req.body;

  if (mongoose.connection.readyState !== 1) {
    return next(
      new CustomError(
        "MongoDB baglantisi yok. PG giris icin /api/pg/auth/login kullanin veya MONGO_URI kontrol edin.",
        503
      )
    );
  }

  const email =
    typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : rawEmail;
  const rawTrimmed = typeof rawEmail === "string" ? rawEmail.trim() : "";

  if (!validateUserInput(email, password)) {
    return next(new CustomError("Please check your inputs", 400));
  }

  let user = await Usermodels.findOne({ email }).select("+password");
  if (!user) {
    user = await Usermodels
      .findOne({
        email: { $regex: new RegExp(`^${escapeRegex(email)}$`, "i") },
      })
      .select("+password");
  }
  // Aynı alana kullanıcı adı yazılmış olabilir (sadece e-posta aranıyordu)
  if (!user && rawTrimmed) {
    user = await Usermodels
      .findOne({
        username: { $regex: new RegExp(`^${escapeRegex(rawTrimmed)}$`, "i") },
      })
      .select("+password");
  }

  const isDev = process.env.NODE_ENV !== "production";

  if (!user) {
    if (isDev) {
      console.warn(
        "[login] Kullanıcı bulunamadı. Kayıtlı e-posta ile deneyin; DB ve MONGO_URI aynı ortam mı kontrol edin."
      );
    }
    return next(new CustomError("Geçersiz e-posta veya şifre", 400));
  }

  const hash = user.password;
  const looksLikeBcrypt = typeof hash === "string" && /^\$2[aby]\$/.test(hash);
  if (!looksLikeBcrypt && isDev) {
    console.warn(
      "[login] Bu kullanıcının şifre alanı bcrypt hash gibi görünmüyor. Compass ile düz metin eklediyseniz:",
      "node server/scripts/reset-user-password.js <email> <yeni_sifre>"
    );
  }

  if (!comparePassword(password, user.password)) {
    if (isDev) {
      console.warn(
        "[login] Şifre eşleşmedi (kullanıcı:",
        user.email,
        "). Klavye düzeni / boşluk / kopyala-yapıştır gizli karakter kontrol edin."
      );
    }
    return next(new CustomError("Geçersiz e-posta veya şifre", 400));
  }

  // Ders 253 te 13.06 kaldiriyor onun yerine alttaki sendJwtToClinent functionu ekliyor
  // res.status(200)
  // .json({
  //   success:true
  // })
  // getAccessTokenFromHeader(user,res)
  sendJwtToClient(user, res);
});
const logout = asyncErrorWrapper(async (req, res, next) => {
  const { NODE_ENV } = process.env;
  return res
    .status(200)
    .cookie({
      httpOnly: true,
      expires: new Date(Date.now()),
      secure: NODE_ENV === "development" ? false : true,
    })
    .json({
      success: true,
      message: "Logout Successfull",
    });
});
const addFacility = async (req, res) => {
  //   console.log(token)
};

// const imageUpload = asyncErrorWrapper(async (req, res, next) => {

//  const user =  await Usermodels.findByIdAndUpdate(req.user.id,{
//     "company_logo" : req.saveProfileImage
//   },{
//     new:true,
//     runValidators:true
//   })
//   res.status(200).json({
//     success: true,
//     message: "Image upload successfull",
//     data:user
//   });
// });


// const imageUpload = asyncErrorWrapper(async (req, res, next) => {

//   // console.log(req.body)
//   const id = req.user.id

//   const {base64} = req.body

//   // <SORGU - UPDATE>
//    const deneme = Usermodels.findByIdAndUpdate(id,{company_logo:base64 } ).exec();

//   // const user =  await Usermodels.findByIdAndUpdate(req.user.id,{"company_logo" : req.body}).exec()

//    res.status(200).json({
//      success: true,
//      message: "Image upload successfull",
//      data:deneme
//    });
//  });


const addScope = asyncErrorWrapper(async (req, res, next) => {
  const { yakitturu, plaka, birim, ilce, kaynak, miktar, sehir, situation, subtitle, tarih, tesis, title, ulke, type, gasType, cartype } = req.body;
  const savedData = await ScopeModel.create({
    gasType,
    birim,
    ilce,
    kaynak,
    miktar,
    sehir,
    situation,
    subtitle,
    tarih,
    tesis,
    title,
    ulke,
    type,
    yakitturu,
    plaka,
    cartype,
    user: req.user.id
  })
  res.status(200)
    .json({
      success: true,
      message: 'add data operation is successfull',
      data: savedData
    })
})

const getUser = (req, res, next) => {
  res.json({
    success: true,
    data: {
      id: req.user.id,
      name: req.user.name,
    },
  });


  // return next(new CustomError("BIR HATA OUSTUR",400))
  //   return next(new CustomError("BIR HATA OUSTU"));
};

/** PUT body: { currentPassword, newPassword } — oturumdaki kullanıcı */
const changePassword = asyncErrorWrapper(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body || {};
  const cur = typeof currentPassword === "string" ? currentPassword : "";
  const neu = typeof newPassword === "string" ? newPassword : "";

  if (!cur || !neu) {
    return next(new CustomError("Mevcut şifre ve yeni şifre zorunludur", 400));
  }
  if (neu.length < 4) {
    return next(new CustomError("Yeni şifre en az 4 karakter olmalıdır", 400));
  }
  if (cur === neu) {
    return next(new CustomError("Yeni şifre mevcut şifre ile aynı olamaz", 400));
  }

  const user = await Usermodels.findById(req.user.id).select("+password");
  if (!user) {
    return next(new CustomError("Kullanıcı bulunamadı", 404));
  }
  if (!comparePassword(cur, user.password)) {
    return next(new CustomError("Mevcut şifre hatalı", 400));
  }

  user.password = neu;
  await user.save();

  return res.status(200).json({
    success: true,
    message: "Şifreniz başarıyla güncellendi",
  });
});

module.exports = {
  register,
  login,
  addFacility,
  getUser,
  logout,
  addScope,
  changePassword,
};
