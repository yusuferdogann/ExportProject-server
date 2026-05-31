const Proforma = require("../../models/Proforma");
const Customer = require("../../models/Customers");
const mongoose = require("mongoose");
const { generateProformaPdf, uploadPdfToCloudinary } = require("../../services/pdfService");

const createProforma = async (req, res) => {
    try {

        // 🔥 SABİT TEST CUSTOMER ID (DB’de gerçekten var olmalı)
        const customerId = req.body.customerId;

        const {
            delivery,
            deliveryInfo,
            quoteNumber,
            invoiceDate,
            validUntil,
            bankInfo,
            originCountry,
            gtipCode,
            note,
            totalNetWeight,
            totalGrossWeight,
            totalPackageCount,
        } = req.body;

        const deliveryData = delivery || (deliveryInfo && {
            type: deliveryInfo.deliveryType,
            vehicle: deliveryInfo.deliveryVehicle,
            point: deliveryInfo.deliveryPoint,
        });
        // 🔥 SABİT TEST CUSTOMER ID (DB’de gerçekten var olmalı)
        // const customer = await Customer.findById(customerId);
        // if (!customer) {
        //     return res.status(404).json({
        //         success: false,
        //         message: "Müşteri bulunamadı",
        //     });
        // }

        const customerDoc = customerId ? await Customer.findById(customerId).lean() : null;

        const proforma = await Proforma.create({
            companyId: req.user.companyId || req.user.id,
            customerId: customerId || new mongoose.Types.ObjectId(),
            delivery: deliveryData,
            quoteNumber,
            invoiceDate,
            validUntil,
            bankInfo,
            originCountry,
            gtipCode,
            note,
            totalNetWeight,
            totalGrossWeight,
            totalPackageCount
        });

        const data = proforma.toObject ? proforma.toObject() : { ...proforma };
        data.customer = customerDoc || {};
        data.totalNetWeight = totalNetWeight ?? data.totalNetWeight;
        data.totalGrossWeight = totalGrossWeight ?? data.totalGrossWeight;
        data.totalPackageCount = totalPackageCount ?? data.totalPackageCount;
        const pdfBuffer = await generateProformaPdf(data);
        const cloudResult = await uploadPdfToCloudinary(pdfBuffer, `proforma-${proforma.quoteNumber}`, "proformas");

        proforma.document = {
            public_id: cloudResult.public_id,
            secure_url: cloudResult.secure_url,
            asset_id: cloudResult.asset_id,
            version: cloudResult.version,
            resource_type: cloudResult.resource_type || "raw",
        };
        await proforma.save();

        res.status(201).json({
            success: true,
            data: proforma,
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Proforma kaydedilemedi",
            error: error.message,
        });
    }
};


const getProformas = async (req, res) => {
    try {
        const proformas = await Proforma.find({
            companyId: req.user.companyId || req.user.id,
        })
            .populate("customerId") // müşteri bilgisi göstermek için
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: proformas,
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Proforma listesi alınamadı",
            error: error.message,
        });
    }
};

module.exports = {
    createProforma,
    getProformas,
};
