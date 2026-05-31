const asyncErrorWrapper = require("express-async-handler");
const Usermodels = require("../../models/User");



const updateCompanyInfo = asyncErrorWrapper(async (req,res,next) =>{
    const user =  await Usermodels.findByIdAndUpdate(req.user.id,{
        "company_info" : [ 
            {
                company_name:req.company_name,
                cknNumber:"dfg",
                companyNumber:"dfg",
                companyMail:"dfg",
                companyWebsite:"www.yusuferdogan.com.tr",
                productArea:"10.000m2",
                closeArea:"5.000m2",
                openArea:"5.000m2",
                workerCount:"220",
                totalArea:"asdasdsss",
            }
            ],
      },{
        new:true,
        runValidators:true
      })
      res.status(200).json({
        success: true,
        message: "company info upload successfull",
        data:user
      });
})

module.exports = updateCompanyInfo