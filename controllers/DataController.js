const Datamodel = require("../models/scopes");

const data = async (req, res) => {
  try {
    const { date, title, subtitle, cities, units, amount } = req.body;
    const newUser = new Datamodel({
      date,
      title,
      subtitle,
      cities,
      units,
      amount,
    });
    await newUser.save();
    res
      .status(200)
      .json({ success: true, message: "data registered succesfull", newUser });
  } catch (error) {
    console.log(error);
  }
};

const getdata = async (req, res) => {
  Datamodel.find()
    .then((users) => res.json(users))
    .catch((err) => res.json(err));
};

module.exports = { data, getdata };
