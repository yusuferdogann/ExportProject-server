const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  tarih: {
    type: String,
  },
  title: {
    type: String,
    trim: true,
  },
  cartype: {
    type: String,
    trim: true,
  },
  subtitle: {
    type: String,
  },
  situation: {
    type: String,
  },
  sehir: {
    type: String,
  },
  ulke: {
    type: String,
  },
  ilce: {
    type: String,
  },
  birim: {
    type: String,
  },
  miktar: {
    type: Number,
  },
  kaynak: {
    type: String,
  },
  tesis: {
    type: String,
  },
  type: {
    type: String,
  },
  yakitturu: {
    type: String,
  },
   plaka: {
    type: String,
  },
  gasType:{
    type:String,
  },
  user: {
    type: mongoose.Schema.ObjectId,
    required: true,
    ref: "users",
  },
});

const DataModel = mongoose.model("data", UserSchema);
module.exports = DataModel;
