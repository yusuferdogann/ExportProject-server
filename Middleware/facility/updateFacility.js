const asyncErrorWrapper = require("express-async-handler");
const Usermodels = require("../../models/User");
const ScopeModel = require("../../models/scopes");
const FacilityModel = require("../../models/facility");
const FacilityInfoModel = require("../../models/facilitiyInfo");
const session = require('express-session');
const mongoose = require("mongoose"); // Mongoose'u import edin

var ObjectId = require("mongoose").Types.ObjectId;

/** Emisyon (scope) kayıtları — yalnızca oturumdaki kullanıcı; tesis adı çakışması / eski localStorage sızıntısını önler */
function matchScopeForUser(req, base) {
  return { ...base, user: new ObjectId(req.user.id) };
}
const pool = require("../../config/database");
const xlsx = require("xlsx");
const multer = require("multer");
const path = require("path");

const express = require("express");

var app = express();
app.locals.data = {};

globalThis.globalVariable;

const updatedFacility = asyncErrorWrapper(async (req, res, next) => {
  const { _id, facilityname } = req.body;

  // Facility'yi id ile bul
  let facility = await FacilityModel.findById(_id);

  // Eğer facility bulunamazsa hata ver
  if (!facility) {
    return res.status(404).json({
      success: false,
      message: "Facility not found"
    });
  }

  // Eski tesis ismini sakla
  const oldFacilityName = facility.facilityname;

  // Yalnızca 'facilityname' alanını güncelle
  facility.facilityname = facilityname;

  // Güncellenmiş facility'yi kaydet
  await facility.save();

  // ScopeModel içinde eski tesis ismini taşıyan tüm kayıtları güncelle
  const updateScopeResult = await ScopeModel.updateMany(
    { tesis: oldFacilityName }, // Eski tesis ismine sahip tüm kayıtları bul
    { $set: { tesis: facilityname } } // Yeni tesis ismi ile güncelle
  );

  res.status(200).json({
    success: true,
    message: "Facility name updated successfully",
    updatedFacility: facility,
    updatedScopeCount: updateScopeResult.modifiedCount, // Güncellenen doküman sayısını döndür
  });
});

const addedFacility = asyncErrorWrapper(async (req, res, next) => {
  // Kullanıcıyı bul
  const user = await Usermodels.findById(req.user.id);

  if (!user) {
    return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  }

  // Owner / Genel Müdür: facilityLimit düşmez
  if (user.role === "owner" || user.role === "general_manager") {
    // Admin olduğunda facilityLimit azaltma işlemi yapılmaz
    const { city, country, employeecount, facilityname, company_logo, state, totalarea, latitude, longitude, CityCode, FieldActivity } = req.body;

    // Yeni tesis ekle
    const newFacility = await FacilityModel.create({
      city,
      country,
      employeecount,
      company_logo,
      facilityname,
      state,
      totalarea,
      latitude,
      longitude,
      CityCode,
      FieldActivity,
      userId: req.user.id,
    });

    await newFacility.save();

    return res.status(200).json({
      success: true,
      message: "Facility successfully added",
      data: newFacility,
    });
  }

  // Eğer facilityLimit 0 ise tesis ekleme
  if (user.facilityLimit <= 0) {
    return res.status(400).json({ message: "Limitiniz doldu! Yeni tesis ekleyemezsiniz." });
  }

  const { city, country, employeecount, facilityname, company_logo, state, totalarea, latitude, longitude, CityCode, FieldActivity } = req.body;

  // Yeni tesis ekle
  const newFacility = await FacilityModel.create({
    city,
    country,
    employeecount,
    company_logo,
    facilityname,
    state,
    totalarea,
    latitude,
    longitude,
    CityCode,
    FieldActivity,
    userId: req.user.id,
  });

  await newFacility.save();

  // Facility limitini azalt (admin değilse)
  user.facilityLimit -= 1;
  await user.save();

  res.status(200).json({
    success: true,
    message: "Facility successfully added",
    data: newFacility,
  });
});

const checkFacilityLimit = asyncErrorWrapper(async (req,res,next)=>{


  const userId = await Usermodels.findById(req.user.id);
  const user = await Usermodels.findById(userId);
  if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  }

  res.json({ facilityLimit: user.facilityLimit });


  console.error("Facility limit kontrol hatası:");
  res.status(500).json({ message: "Sunucu hatası" });
})

const checkReportLimit = asyncErrorWrapper(async (req,res,next)=>{


  const userId = await Usermodels.findById(req.user.id);
  const user = await Usermodels.findById(userId);
  console.log("userId-checkreportLimint--------",userId)
  if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  }

  res.json({ reportLimit: user.reportLimit });


  console.error("Facility limit kontrol hatası:");
  res.status(500).json({ message: "Sunucu hatası" });
})

const getReportLimit = asyncErrorWrapper(async (req,res,next)=>{


  const userId = await Usermodels.findById(req.user.id);
  const user = await Usermodels.findById(userId);
  console.log("userId-checkreportLimint--------",userId)
  if (!user) {
      return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  }

  res.json({ reportLimit: user.reportLimit });


  console.error("Facility limit kontrol hatası:");
  res.status(500).json({ message: "Sunucu hatası" });
})

const checkBalanceReport = asyncErrorWrapper(async (req, res, next) => {
  const userId = await Usermodels.findById(req.user.id);
  const user = await Usermodels.findById(userId);

  if (!user) {
    return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  }

  // Owner / Genel Müdür: reportLimit azaltılmaz
  if (user.role !== "owner" && user.role !== "general_manager") {
    // ❌ Eğer reportLimit 0 ise işlem yapma
    if (user.reportLimit <= 0) {
      return res.status(400).json({ message: "Limitiniz doldu! Yeni tesis ekleyemezsiniz." });
    }

    // ✅ Report limitini azalt
    user.reportLimit -= 1;
    // ✅ Güncellenmiş kullanıcı verisini kaydet
    await user.save();
  }

  res.status(200).json({
    success: true,
    message: "Facility add successful",
  });
});

const getOneFacility = asyncErrorWrapper(async (req, res, next) => {
  const { tesisName, tesisNo } = req.body;

 // Veriyi session'a kaydet
 req.session.facilityData = { tesisName, tesisNo };

  // console.log("Tesis adı:",   req.session.facilityData);
  // console.log("Tesis numarası:", tesisNo);

  res.json({
    success: true,
    message: "Facility information saved in session",
    // data: tesisName,
  });
});

const imageUpload = asyncErrorWrapper(async (req, res, next) => {
  try {
    const companyId = req.user?.companyId;
    const { base64 } = req.body;

    if (!companyId) {
      return res.status(400).json({ success: false, message: "companyId bulunamadı" });
    }
    if (!base64) {
      return res.status(400).json({ success: false, message: "Logo verisi eksik" });
    }

    const companyObjectId = new mongoose.Types.ObjectId(String(companyId));

    const updated = await FacilityInfoModel.findOneAndUpdate(
      { companyId: companyObjectId },
      { $set: { companyLogo: base64 }, $setOnInsert: { companyId: companyObjectId } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      success: true,
      message: "Logo başarıyla güncellendi",
      data: { companyLogo: updated?.companyLogo || "" },
    });
  } catch (error) {
    console.error("Resim yükleme hatası:", error);
    res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

const findObjectName = asyncErrorWrapper(async (req, res, next) => {
  // const result = Usermodels.find({ facility: "Scope-1"});
  // const result = Usermodels.find({ facility : { $elemMatch: { name: "Scope-1" }}});
  const followedUsers = Usermodels.find({ "facility.data": "Scope-1" });



  res.json({
    success: true,
    message: "yes two Object name is equal",
    data: followedUsers,
  });
});

const getAllFacility = asyncErrorWrapper(async (req, res, next) => {
  

  const id = await Usermodels.findById(req.user.id);

  Usermodels.findByIdAndUpdate(id, { $all: { facility } }).exec();

  res.status(200).json({
    success: true,
    message: "facility get all successfull",
    // data:req.user.facility
  });

  res.json({
    success: true,
    message: "All facility successful",
    data: veriall,
  });
});

const filterFacilityByUserId = asyncErrorWrapper(async (req, res, next) => {
  const id = req.user.id;
  // const filterfacility = await FacilityModel.findById(userId).populate("userId").exec()
  // const veriall = await FacilityModel.findById(userId, { $where: { facility: item } }).exec();

  const veriall = await FacilityModel.find({ userId: id });

  res.json({
    success: true,
    message: "ok filter of user ID",
    data: veriall,
  });
});

const getLogo = asyncErrorWrapper(async (req, res, next) => {
  const companyId = req.user?.companyId;
  if (!companyId) {
    return res.status(400).json({ success: false, message: "companyId bulunamadı" });
  }

  const companyObjectId = new mongoose.Types.ObjectId(String(companyId));
  const info = await FacilityInfoModel.findOne({ companyId: companyObjectId }).select("companyLogo");

  res.json({
    success: true,
    message: "Logo başarıyla getirildi.",
    data: info?.companyLogo || "",
  });
});

const filterAmountByUserId = asyncErrorWrapper(async (req, res, next) => {
  // iki sorgu arasinda daglar kadar fark var <SORGU-1>
  // var filterfacility = await ScopeModel.find({user:id},{title:"Scope-2"}).select("miktar ");

  // iki sorgu arasinda daglar kadar fark var <SORGU-2>
  // var filterfacility = await ScopeModel.find({user:req.user.id},{title:"Scope-1"}).exec();

  // <SORGU-3>
  var Scope1 = await ScopeModel.find({ title: "Scope-1", situation: "Kasım" })
    .select("miktar")
    .exec();
  var Scope2 = await ScopeModel.find({ title: "Scope-2", situation: "Kasım" })
    .select("miktar")
    .exec();

  res.json({
    success: true,
    message: "ok filter of mount",
    data: {
      Scope1: Scope1,
      Scope2: Scope2,
    },
  });
});

const summaryFilterData = asyncErrorWrapper(async (req, res, next) => {
  const { ScopeTitle, Situation, Subtitle } = req.body;

  var SummaryData = await ScopeModel.find({
    title: ScopeTitle,
    situation: Situation,
    subtitle: Subtitle,
  }).exec();

  res.json({
    success: true,
    message: "ok that right get all summary data successfully",
    data: SummaryData,
  });
});

const summaryFilterSubData = asyncErrorWrapper(async (req, res, next) => {
  const { ScopeTitle, Situation, Subtitle, TravelType } = req.body;

  var SummaryData = await ScopeModel.find({
    title: ScopeTitle,
    situation: Situation,
    subtitle: Subtitle,
    type: TravelType,
  }).exec();

  res.json({
    success: true,
    message: "ok that right get all summary data successfully",
    data: SummaryData,
  });
});

const DashboardMounthGrafic = asyncErrorWrapper(async (req, res, next) => {
  // const {ScopeTitle,Situation,Subtitle} = req.body

   // Tesis bilgisini al
   const tesisName =
   req.session?.facilityData?.tesisName || req.body.tesis || req.query.tesis;

 if (!tesisName) {
   return res.status(400).json({
     success: false,
     message: "Tesis bilgisi bulunamadı. Lütfen giriş yapın veya tesis seçin.",
   });
 }

  var Scope1Ocak = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Ocak" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Subat = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Şubat" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Mart = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Mart" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Nisan = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Nisan" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Mayis = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Mayıs" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Haziran = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Haziran" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Temmuz = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Temmuz" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Agustos = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Ağustos" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Eylul = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Eylül" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Ekim = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Ekim" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Kasim = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Kasım" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope1Aralik = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-1", situation: "Aralık" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);

  var Scope2Ocak = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Ocak" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Subat = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Şubat" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Mart = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Mart" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Nisan = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Nisan" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Mayis = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Mayıs" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Haziran = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Haziran" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Temmuz = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Temmuz" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Agustos = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Ağustos" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Eylul = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Eylül" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Ekim = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Ekim" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Kasim = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Kasım" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope2Aralik = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-2", situation: "Aralık" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);

  var Scope3Ocak = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Ocak" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Subat = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Şubat" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Mart = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Mart" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Nisan = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Nisan" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Mayis = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Mayıs" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Haziran = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Haziran" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Temmuz = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Temmuz" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Agustos = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Ağustos" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Eylul = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Eylül" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Ekim = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Ekim" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Kasim = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Kasım" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);
  var Scope3Aralik = await ScopeModel.aggregate([
    { $match: matchScopeForUser(req, { tesis: tesisName, title: "SCOPE-3", situation: "Aralık" }) },
    { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
  ]);

  const Ocak = Scope1Ocak[0]?.miktar;
  const Subat = Scope1Subat[0]?.miktar;
  const Mart = Scope1Mart[0]?.miktar;
  const Nisan = Scope1Nisan[0]?.miktar;
  const Mayis = Scope1Mayis[0]?.miktar;
  const Haziran = Scope1Haziran[0]?.miktar;
  const Temmuz = Scope1Temmuz[0]?.miktar;
  const Agustos = Scope1Agustos[0]?.miktar;
  const Eylul = Scope1Eylul[0]?.miktar;
  const Ekim = Scope1Ekim[0]?.miktar;
  const Kasim = Scope1Kasim[0]?.miktar;
  const Aralik = Scope1Aralik[0]?.miktar;

  const Ocak2 = Scope2Ocak[0]?.miktar;
  const Subat2 = Scope2Subat[0]?.miktar;
  const Mart2 = Scope2Mart[0]?.miktar;
  const Nisan2 = Scope2Nisan[0]?.miktar;
  const Mayis2 = Scope2Mayis[0]?.miktar;
  const Haziran2 = Scope2Haziran[0]?.miktar;
  const Temmuz2 = Scope2Temmuz[0]?.miktar;
  const Agustos2 = Scope2Agustos[0]?.miktar;
  const Eylul2 = Scope2Eylul[0]?.miktar;
  const Ekim2 = Scope2Ekim[0]?.miktar;
  const Kasim2 = Scope2Kasim[0]?.miktar;
  const Aralik2 = Scope2Aralik[0]?.miktar;

  const Ocak3 = Scope3Ocak[0]?.miktar;
  const Subat3 = Scope3Subat[0]?.miktar;
  const Mart3 = Scope3Mart[0]?.miktar;
  const Nisan3 = Scope3Nisan[0]?.miktar;
  const Mayis3 = Scope3Mayis[0]?.miktar;
  const Haziran3 = Scope3Haziran[0]?.miktar;
  const Temmuz3 = Scope3Temmuz[0]?.miktar;
  const Agustos3 = Scope3Agustos[0]?.miktar;
  const Eylul3 = Scope3Eylul[0]?.miktar;
  const Ekim3 = Scope3Ekim[0]?.miktar;
  const Kasim3 = Scope3Kasim[0]?.miktar;
  const Aralik3 = Scope3Aralik[0]?.miktar;

  const Scope1GrafikData = [
    Ocak,
    Subat,
    Mart,
    Nisan,
    Mayis,
    Haziran,
    Temmuz,
    Agustos,
    Eylul,
    Ekim,
    Kasim,
    Aralik,
  ];
  const Scope2GrafikData = [
    Ocak2,
    Subat2,
    Mart2,
    Nisan2,
    Mayis2,
    Haziran2,
    Temmuz2,
    Agustos2,
    Eylul2,
    Ekim2,
    Kasim2,
    Aralik2,
  ];
  const Scope3GrafikData = [
    Ocak3,
    Subat3,
    Mart3,
    Nisan3,
    Mayis3,
    Haziran3,
    Temmuz3,
    Agustos3,
    Eylul3,
    Ekim3,
    Kasim3,
    Aralik3,
  ];

 

  res.json({
    success: true,
    message: "Successfly dashboard Grafic data",
    data: { Scope1GrafikData, Scope2GrafikData, Scope3GrafikData },
  });
});

const DashboardFacilityGrafic = asyncErrorWrapper(async (req, res, next) => {
  const id = req.user.id;

  const veriall = await FacilityModel.find({ userId: id }).exec();
  const ResultData = [];

  let totalAmount = 0; // Toplam miktarı hesaplamak için değişken oluştur

  for (let i = 0; i < veriall.length; i++) {
    const element = veriall[i].facilityname;
    var FacilityScope1 = await ScopeModel.aggregate([
      { $match: matchScopeForUser(req, { tesis: element }) },
      { $group: { _id: null, miktar: { $sum: { $toInt: "$miktar" } } } },
    ]);

    // console.log("miktar-----", FacilityScope1);

    let amount = FacilityScope1[0]?.miktar || 0;
    ResultData.push(amount);
    totalAmount += amount; // Toplam miktarı güncelle
  }

  // Yüzdelik hesaplama
  const PercentageData = ResultData.map((amount) => 
    totalAmount > 0 ? parseFloat(((amount * 100) / totalAmount).toFixed(2)) : 0
  );

  res.json({
    success: true,
    message: "ok that right facility grafic",
    data: PercentageData, // Yüzdelik veriyi gönder
  });
});

const DashboardScopeGrafic = asyncErrorWrapper(async (req, res, next) => {
   // Tesis bilgisini al
   const tesisName =
   req.session?.facilityData?.tesisName || req.body.tesis || req.query.tesis;

  // Tesis adı yoksa hata dönüyoruz
  if (!tesisName) {
    return res.status(400).json({
      success: false,
      message: "Tesis bilgisi bulunamadı.",
    });
  }

  // Veriyi çekmek için ScopeModel.aggregate() fonksiyonları
  const getScopeData = async (scopeTitle) => {
    const result = await ScopeModel.aggregate([
      {
        $match: {
          user: new ObjectId(req.user.id),
          title: scopeTitle,
          tesis: tesisName,
        },
      },
      { $group: { _id: null, miktar: { $sum: "$miktar" } } },
    ]);
    return result[0]?.miktar || 0; // Veriyi döndürürken 0 dönebilir
  };

  try {
    // Verileri paralel olarak çekiyoruz
    const [CardScope1, CardScope2, CardScope3] = await Promise.all([
      getScopeData("SCOPE-1"),
      getScopeData("SCOPE-2"),
      getScopeData("SCOPE-3"),
    ]);

    // Veriler başarılı şekilde alındı
    res.json({
      success: true,
      message: "Card Scope verisi başarıyla alındı.",
      data: {
        CardScope1,
        CardScope2,
        CardScope3,
      },
    });
  } catch (error) {
    // Eğer bir hata oluşursa, hata mesajı döndürüyoruz
    console.error("DashboardScopeGrafic hata:", error);
    res.status(500).json({
      success: false,
      message: "Veri alınırken hata oluştu.",
    });
  }
});

const ReportDonutGrafic = asyncErrorWrapper(async (req, res, next) => {
  // Tesis bilgisini al
  const tesisName =
  req.session?.facilityData?.tesisName || req.body.tesis || req.query.tesis;

 // Tesis adı yoksa hata dönüyoruz
 if (!tesisName) {
   return res.status(400).json({
     success: false,
     message: "Tesis bilgisi bulunamadı.",
   });
 }

 // Veriyi çekmek için ScopeModel.aggregate() fonksiyonları
 const getScopeData = async (scopeTitle) => {
   const result = await ScopeModel.aggregate([
     {
       $match: {
         user: new ObjectId(req.user.id),
         title: scopeTitle,
         tesis: tesisName,
       },
     },
     { $group: { _id: null, miktar: { $sum: "$miktar" } } },
   ]);
   return result[0]?.miktar || 0; // Veriyi döndürürken 0 dönebilir
 };

 try {
   // Verileri paralel olarak çekiyoruz
   const [CardScope1, CardScope2, CardScope3] = await Promise.all([
     getScopeData("SCOPE-1"),
     getScopeData("SCOPE-2"),
     getScopeData("SCOPE-3"),
   ]);

   // Toplam emisyonları hesapla
   const totalScope = CardScope1 + CardScope2 + CardScope3;

   // Yüzdelik hesaplama
   const percentageScope1 = totalScope ? ((CardScope1 / totalScope) * 100).toFixed(2) : 0;
   const percentageScope2 = totalScope ? ((CardScope2 / totalScope) * 100).toFixed(2) : 0;
   const percentageScope3 = totalScope ? ((CardScope3 / totalScope) * 100).toFixed(2) : 0;

   // Veriler başarılı şekilde alındı
   res.json({
     success: true,
     message: "Card Scope verisi başarıyla alındı.",
     data: [percentageScope1, percentageScope2, percentageScope3], // Yüzde değerleri array olarak dönüyoruz
   });
 } catch (error) {
   // Eğer bir hata oluşursa, hata mesajı döndürüyoruz
   console.error("DashboardScopeGrafic hata:", error);
   res.status(500).json({
     success: false,
     message: "Veri alınırken hata oluştu.",
   });
 }
});

const DashboardWeekGrafic = asyncErrorWrapper(async (req, res, next) => {
  // Tesis bilgisini al
  const tesisName =
    req.session?.facilityData?.tesisName || req.body.tesis || req.query.tesis;

  if (!tesisName) {
    return res.status(400).json({
      success: false,
      message: "Tesis bilgisi bulunamadı. Lütfen giriş yapın veya tesis seçin.",
    });
  }

  console.log("Grafik Week Tesis:", tesisName);

  try {
    // Miktarları çekmek için yardımcı fonksiyon
    const getTotalMiktarBySituation = async (situation) => {
      const result = await ScopeModel.aggregate([
        { $match: matchScopeForUser(req, { tesis: tesisName, situation }) },
        { $group: { _id: null, miktar: { $sum: "$miktar" } } },
      ]);
      return result[0]?.miktar || 0; // Eğer sonuç yoksa 0 dön
    };

    // Paralel sorgularla daha hızlı işlem
    const [arrayPazarFirst, arrayPazarSecound, arrayPazarThird, arrayPazarFour] =
      await Promise.all([
        getTotalMiktarBySituation("Ocak - Mart"),
        getTotalMiktarBySituation("Nisan - Haziran"),
        getTotalMiktarBySituation("Temmuz - Eylül"),
        getTotalMiktarBySituation("Ekim - Aralık"),
      ]);

    // console.log("Grafik Verileri:", {
    //   Ocak_Mart: arrayPazarFirst,
    //   Nisan_Haziran: arrayPazarSecound,
    //   Temmuz_Eylul: arrayPazarThird,
    //   Ekim_Aralik: arrayPazarFour,
    // });

    res.json({
      success: true,
      message: "Dashboard grafik verisi başarıyla alındı.",
      data: {
        Ocak_Mart: [arrayPazarFirst || 0], 
        Nisan_Haziran: [arrayPazarSecound || 0], 
        Temmuz_Eylul: [arrayPazarThird || 0], 
        Ekim_Aralik: [arrayPazarFour || 0]
      },
    });
  } catch (error) {
    console.error("Grafik verisi çekilirken hata oluştu:", error);
    res.status(500).json({
      success: false,
      message: "Grafik verisi alınırken hata oluştu.",
    });
  }
});

const ReportPeriodData = asyncErrorWrapper(async (req, res, next) => {
  
  // Tesis bilgisini al
  const tesisName =
    req.session?.facilityData?.tesisName || req.body.tesis || req.query.tesis;

  if (!tesisName) {
    return res.status(400).json({
      success: false,
      message: "Tesis bilgisi bulunamadı. Lütfen giriş yapın veya tesis seçin.",
    });
  }

  var ReportPeriod_Ocak_Mart1 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, { title: "SCOPE-1", tesis: tesisName, situation: "Ocak - Mart" }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);
  var ReportPeriod_Nisan_Haziran1 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, {
        title: "SCOPE-1",
        tesis: tesisName,
        situation: "Nisan - Haziran",
      }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);
  var ReportPeriod_Temmuz_Eylul1 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, {
        title: "SCOPE-1",
        tesis: tesisName,
        situation: "Temmuz - Eylül",
      }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);
  var ReportPeriod_Ekim_Aralik1 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, {
        title: "SCOPE-1",
        tesis: tesisName,
        situation: "Ekim - Aralık",
      }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);

  var ReportPeriod_Ocak_Mart2 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, { title: "SCOPE-2", tesis: tesisName, situation: "Ocak - Mart" }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);
  var ReportPeriod_Nisan_Haziran2 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, {
        title: "SCOPE-2",
        tesis: tesisName,
        situation: "Nisan - Haziran",
      }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);
  var ReportPeriod_Temmuz_Eylul2 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, {
        title: "SCOPE-2",
        tesis: tesisName,
        situation: "Temmuz - Eylül",
      }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);
  var ReportPeriod_Ekim_Aralik2 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, {
        title: "SCOPE-2",
        tesis: tesisName,
        situation: "Ekim - Aralık",
      }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);

  var ReportPeriod_Ocak_Mart3 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, { title: "SCOPE-3", tesis: tesisName, situation: "Ocak - Mart" }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);
  var ReportPeriod_Nisan_Haziran3 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, {
        title: "SCOPE-3",
        tesis: tesisName,
        situation: "Nisan - Haziran",
      }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);
  var ReportPeriod_Temmuz_Eylul3 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, {
        title: "SCOPE-3",
        tesis: tesisName,
        situation: "Temmuz - Eylül",
      }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);
  var ReportPeriod_Ekim_Aralik3 = await ScopeModel.aggregate([
    {
      $match: matchScopeForUser(req, {
        title: "SCOPE-3",
        tesis: tesisName,
        situation: "Ekim - Aralık",
      }),
    },
    { $group: { _id: null, miktar: { $sum: "$miktar" } } },
  ]);

  res.json({
    success: true,
    data: {
      KAPSAM1: [
        ReportPeriod_Ocak_Mart1,
        ReportPeriod_Nisan_Haziran1,
        ReportPeriod_Temmuz_Eylul1,
        ReportPeriod_Ekim_Aralik1,
      ],
      KAPSAM2: [
        ReportPeriod_Ocak_Mart2,
        ReportPeriod_Nisan_Haziran2,
        ReportPeriod_Temmuz_Eylul2,
        ReportPeriod_Ekim_Aralik2,
      ],
      KAPSAM3: [
        ReportPeriod_Ocak_Mart3,
        ReportPeriod_Nisan_Haziran3,
        ReportPeriod_Temmuz_Eylul3,
        ReportPeriod_Ekim_Aralik3,
      ],
    },
  });
});

const DeletedFacility = asyncErrorWrapper(async (req, res, next) => {
  const { idDeletedFacility } = req.body;

  // 1️⃣ Silinecek Facility'yi bul
  const facility = await FacilityModel.findById(idDeletedFacility);

  if (!facility) {
    return res.status(404).json({
      success: false,
      message: "Facility not found"
    });
  }

  // 2️⃣ Facility'nin ismini al
  const facilityName = facility.facilityname;

  // 3️⃣ Facility'yi MongoDB'den sil
  await FacilityModel.findByIdAndDelete(idDeletedFacility);

  // 4️⃣ ScopeModel'den bu facility adına ait tüm kayıtları sil
  const deletedScopeData = await ScopeModel.deleteMany({ tesis: facilityName });

  res.json({
    success: true,
    message: "Facility and related scope data deleted successfully",
    deletedFacility: facility,
    deletedScopeCount: deletedScopeData.deletedCount, // Silinen kayıt sayısını döndür
  });
});

const GetAllScopeByDateOfDaily = asyncErrorWrapper(async (req, res, next) => {
  try {
    const tesisName = req.session.facilityData?.tesisName;
    if (!tesisName) {
      return res.status(400).json({
        success: false,
        message: "Tesis adı bulunamadı.",
      });
    }

    const currentdate = new Date();
    const datetime =
      ("0" + currentdate.getDate()).slice(-2) + "." +
      ("0" + (currentdate.getMonth() + 1)).slice(-2) + "." +
      currentdate.getFullYear();

    console.log("Sorgulanan Tesis:", tesisName);
    console.log("Sorgulanan Tarih:", datetime);

    const DailyScope = await ScopeModel.find({
      tesis: tesisName,
      tarih: datetime,
      user: new ObjectId(req.user.id),
    }).exec();

    // 🟢 Eğer veri yoksa, hata dönmek yerine boş dizi gönderelim
    if (!DailyScope?.length) {
      return res.json({
        success: true,
        data: [], // ❗ Artık 404 yerine boş bir dizi döndürüyoruz.
      });
    }

    res.json({
      success: true,
      data: DailyScope,
    });
  } catch (error) {
    console.error("Günlük veri alma hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası, lütfen tekrar deneyin.",
    });
  }
});

const DeletedScope = asyncErrorWrapper(async (req, res, next) => {
  const { deleteScopeId } = req.body;
  // console.log("deleed-id------",deleteScopeId)

  const deletedData = await ScopeModel.findByIdAndDelete({
    _id: new ObjectId(deleteScopeId),
  });

  res.json({
    success: true,
    data: deletedData,
  });
});

const FacilitySaveInfo = asyncErrorWrapper(async (req, res, next) => {
  const {
    companyName,
    cknNumber,
    companyNumber,
    companyMail,
    companyWebsite,
    fieldActivity,
    closeArea,
    openArea,
    workerCount,
    totalArea,
    address,
  } = req.body;

  const companyId = req.user?.companyId;
  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: "companyId bulunamadı.",
    });
  }

  // companyId bazında tek kayıt: create yerine upsert
  const savedData = await FacilityInfoModel.findOneAndUpdate(
    { companyId: new mongoose.Types.ObjectId(String(companyId)) },
    {
      $set: {
        companyName,
        cknNumber,
        companyNumber,
        companyMail,
        companyWebsite,
        fieldActivity,
        closeArea,
        openArea,
        workerCount,
        totalArea,
        address,
      },
      $setOnInsert: {
        companyId: new mongoose.Types.ObjectId(String(companyId)),
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  // console.log("facility info--",resultId)

  res.json({
    success: true,
    message: "facility info post operation successfuly",
    data: savedData,
  });
});

const GetFacilityInfo = asyncErrorWrapper(async (req, res, next) => {
  
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId bulunamadı.",
      });
    }

    // companyId ile tek kayıt
    const facilityInfo = await FacilityInfoModel.findOne({
      companyId: new mongoose.Types.ObjectId(String(companyId)),
    });

    res.json({
      success: true,
      message: "Tesis bilgisi başarıyla alındı.",
      // Kayıt yoksa frontend boş form açabilsin
      data: facilityInfo || {},
    });
  } catch (error) {
    console.error("Tesis bilgisi alma hatası: ", error);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası, lütfen daha sonra tekrar deneyin.",
    });
  }
});

const FacilityUpdateInfo = asyncErrorWrapper(async (req, res, next) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: "companyId bulunamadı.",
      });
    }

    const companyObjectId = new mongoose.Types.ObjectId(String(companyId));

    // Gelen verileri filtreleme (Sadece undefined ve null olanları çıkarıyoruz, boş stringleri dahil ediyoruz)
    const updateFields = Object.entries(req.body).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Güncellenecek herhangi bir veri bulunamadı.",
      });
    }

    // companyId client'tan set edilemesin
    delete updateFields.companyId;
    delete updateFields.facilityId;

    const facility = await FacilityInfoModel.findOneAndUpdate(
      { companyId: companyObjectId },
      {
        $set: updateFields, // Boş stringler dahil olacak
        $setOnInsert: { companyId: companyObjectId },
      },
      { new: true, runValidators: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (!facility) {
      return res.status(404).json({
        success: false,
        message: "Tesis bilgisi kaydedilemedi.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Tesis bilgileri başarıyla kaydedildi.",
      data: facility,
    });
  } catch (error) {
    console.error("Güncelleme hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası, lütfen tekrar deneyin.",
    });
  }
});

const GetExcelData = asyncErrorWrapper(async (req, res, next) => {
  // 📌 Excel Dosyasının Plesk'teki Konumu
  const EXCEL_FILE_PATH = "/var/www/vhosts/app.carbonistan.com/httpdocs/server/uploads/CBAM_Raporu.xlsx";
  console.log("selam---------------------",EXCEL_FILE_PATH)
  try {
    // 📌 Excel dosyasını oku
    const workbook = xlsx.readFile(EXCEL_FILE_PATH, {
      cellStyles: true,
      cellFormula: true,
    });

    const sheetName = "Veri_Girisi"; // Otomatik olarak bu sayfa seçilecek
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      return res
        .status(404)
        .json({ error: `"${sheetName}" sayfası bulunamadı!` });
    }

    // 📌 Tüm formatları ve stilleri koruyarak JSON'a çevir
    const jsonData = xlsx.utils.sheet_to_json(sheet, {
      raw: false,
      defval: "",
    });

    // 📌 Hücreleri formülleriyle birlikte oku
    const cellData = {};
    Object.keys(sheet).forEach((cell) => {
      if (!cell.startsWith("!")) {
        cellData[cell] = {
          v: sheet[cell].v, // Hücre değeri
          f: sheet[cell].f || null, // Formül varsa ekle
          s: sheet[cell].s || {}, // Stil bilgisi
        };
      }
    });

    res.json({ sheetName, data: jsonData, rawData: cellData });
  } catch (error) {
    console.error("Excel okunurken hata oluştu:", error);
    res.status(500).json({ error: "Excel okunurken hata oluştu!" });
  }
});

const EditData = asyncErrorWrapper(async (req, res, next) => {
    const { id, miktar } = req.body; // Frontend’den gelen veriyi al
    // Eğer gerekli alanlar eksikse hata döndür
    if (!id || miktar === undefined) {
        return res.status(400).json({ success: false, message: "Eksik veri gönderildi." });
    }

    // Güncellenecek veriyi MongoDB'de ara
    const existingData = await ScopeModel.findById(id);
    if (!existingData) {
        return res.status(404).json({ success: false, message: "Veri bulunamadı." });
    }

    // Miktarı güncelle
    existingData.miktar = miktar;
    await existingData.save();

    return res.status(200).json({ success: true, message: "Veri başarıyla güncellendi.", data: existingData });
});

const TotalEmission = asyncErrorWrapper(async (req, res, next) => {
  // Kullanıcıyı bul
  const user = await Usermodels.findById(req.user.id);
console.log("user----",user)
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "Kullanıcı bulunamadı.",
    });
  }

  // Kullanıcının sahip olduğu tüm tesisleri al
  const userFacilities = await ScopeModel.distinct("tesis", { user: user._id });
  console.log("user----",userFacilities)

  if (!userFacilities.length) {
    return res.status(404).json({
      success: false,
      message: "Kullanıcıya ait tesis bulunamadı.",
    });
  }

  // Her bir tesis için toplam miktarı hesapla
  const totalEmissions = await Promise.all(
    userFacilities.map(async (facility) => {
      const result = await ScopeModel.aggregate([
        { $match: { tesis: facility, user: user._id } },
        { $group: { _id: "$tesis", totalMiktar: { $sum: { $toInt: "$miktar" } } } },
      ]);
      
      return {
        tesis: facility,
        toplamMiktar: result.length > 0 ? result[0].totalMiktar : 0,
      };
    })
  );

  return res.status(200).json({
    success: true,
    message: "Veriler başarıyla getirildi.",
    data: totalEmissions,
  });
});

const controlFacility = asyncErrorWrapper(async (req, res, next) => {

console.log("selam")

  return res.status(200).json({
    success: true,
    message: "Veriler başarıyla getirildi.",
  });
});



module.exports = {
  GetFacilityInfo,
  updatedFacility,
  addedFacility,
  checkFacilityLimit,
  TotalEmission,
  EditData,
  GetExcelData,
  controlFacility,
  FacilityUpdateInfo,
  getLogo,
  imageUpload,
  findObjectName,
  getAllFacility,
  filterFacilityByUserId,
  filterAmountByUserId,
  summaryFilterData,
  DashboardMounthGrafic,
  DashboardFacilityGrafic,
  DashboardScopeGrafic,
  DashboardWeekGrafic,
  DeletedFacility,
  summaryFilterSubData,
  ReportPeriodData,
  GetAllScopeByDateOfDaily,
  DeletedScope,
  getOneFacility,
  FacilitySaveInfo,
  checkReportLimit,
  checkBalanceReport,
  getReportLimit,
  ReportDonutGrafic
};
