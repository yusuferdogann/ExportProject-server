const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rolePermissions = require("../config/roles");

const limits = {
  demo: { reportLimit: 1, facilityLimit: 1 },
  employee: { reportLimit: 4, facilityLimit: 1 },
  foreign_trade_manager: { reportLimit: 12, facilityLimit: 5 },
  finance_manager: { reportLimit: 12, facilityLimit: 5 },
  administrator: { reportLimit: Infinity, facilityLimit: Infinity },
  general_manager: { reportLimit: Infinity, facilityLimit: Infinity },
  owner: { reportLimit: Infinity, facilityLimit: Infinity },
};

const UserSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },

  role: {
    type: String,
    enum: [
      "owner",
      "foreign_trade_manager",
      "general_manager",
      "finance_manager",
      "administrator",
      "demo",
      "employee",
    ],
    default: "demo",
    required: true,
  },

  // 🔥 USER-LEVEL PERMISSIONS (YENİ)
  permissions: {
    type: [String],
    default: [],
  },

  roleTemplateId: { type: Schema.Types.ObjectId, ref: "roletemplates", default: null },
  customRoleId: { type: Schema.Types.ObjectId, ref: "customroles", default: null },

  reportLimit: Number,
  facilityLimit: Number,

  companyId: {
    type: Schema.Types.ObjectId,
    ref: "companies",
    required: true,
  },

  username: {
    type: String,
    required: true,
    trim: true,
  },

  password: {
    type: String,
    required: true,
    minlength: 4,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

/**
 * Rol değiştiğinde limitleri güncelle
 */
UserSchema.pre("save", function (next) {
  if (this.isNew || this.isModified("role")) {
    const roleSettings = limits[this.role] || limits.demo;
    this.reportLimit = roleSettings.reportLimit;
    this.facilityLimit = roleSettings.facilityLimit;
  }
  next();
});

/**
 * JWT üretimi (ROLE + USER permission birleşimi)
 */
UserSchema.methods.genereteJwtFromUser = function () {
  const { JWT_SECRET_KEY, JWT_EXPIRE } = process.env;

  const rolePerms = rolePermissions[this.role] || [];
  const userPerms = this.permissions || [];

  // merge + duplicate temizleme
  const permissions = Array.from(new Set([...rolePerms, ...userPerms]));

  const payload = {
    id: this._id,
    username: this.username,
    email: this.email,
    role: this.role,
    permissions,
    companyId: this.companyId,
  };

  return jwt.sign(payload, JWT_SECRET_KEY, {
    expiresIn: JWT_EXPIRE,
  });
};

/**
 * Password hash
 */
UserSchema.pre("save", function (next) {
  if (!this.isModified("password")) return next();

  bcrypt.genSalt(10, (err, salt) => {
    if (err) return next(err);

    bcrypt.hash(this.password, salt, (err, hash) => {
      if (err) return next(err);
      this.password = hash;
      next();
    });
  });
});

module.exports = mongoose.model("users", UserSchema);
