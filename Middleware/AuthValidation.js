const Joi = require("joi");
const router = require("../routes/ProductRouter");
var httpContext = require('express-http-context');
const database = require("../config/database");



const signupValidation = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().min(6).required(),
    email: Joi.string().required().email(),
    password: Joi.string().min(4).max(100).required(),
  });
  const {error} = schema.validate(req.body);
  if (error) {
    return res.status(405)
    .json({ message: "Bad requrest singup", error });
  }
  next();
};

const loginValidation = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email(),
    password: Joi.string().min(4).max(100).required(),
  });
  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(406)
    .json({ message: "Bad requrest login", error });
  }
  next();
};


function getUserInfo(title, content, callback) {
  // var user = httpContext.get('user');
  // database.insert({ title, content }, callback);
  // console.log(user)
  console.log("test",req.session.user)

}


module.exports = {
  signupValidation,
  loginValidation,
  getUserInfo
};
