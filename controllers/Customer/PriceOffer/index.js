const PriceQuote = require("../models/priceQuote.model");

exports.createPriceQuote = async (req, res) => {
  try {
    const {
      companyId,
      products,
      customerId,
      delivery,
      priceInfo,
      destinationCountry
    } = req.body;

    if (!companyId) {
      return res.status(400).json({ message: "CompanyId zorunlu" });
    }

    if (!products || !products.length) {
      return res.status(400).json({ message: "En az bir ürün eklenmeli" });
    }

    const totalAmount = products.reduce(
      (acc, item) => acc + Number(item.quantity) * Number(item.price),
      0
    );

    const newQuote = await PriceQuote.create({
      companyId,
      products,
      customerId,
      delivery,
      priceInfo,
      destinationCountry,
      totalAmount
    });

    res.status(201).json({
      success: true,
      data: newQuote
    });
  } catch (error) {
    console.error("CREATE_PRICE_QUOTE_ERROR:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getAllByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    const quotes = await PriceQuote.find({ companyId })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: quotes
    });
  } catch (error) {
    console.error("GET_QUOTES_ERROR:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getSingle = async (req, res) => {
  try {
    const { id } = req.params;

    const quote = await PriceQuote.findById(id);

    if (!quote) {
      return res.status(404).json({ message: "Kayıt bulunamadı" });
    }

    res.status(200).json({
      success: true,
      data: quote
    });
  } catch (error) {
    console.error("GET_SINGLE_QUOTE_ERROR:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.updatePriceQuote = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      products,
      delivery,
      priceInfo,
      destinationCountry
    } = req.body;

    let totalAmount = 0;

    if (products && products.length) {
      totalAmount = products.reduce(
        (acc, item) => acc + Number(item.quantity) * Number(item.price),
        0
      );
    }

    const updated = await PriceQuote.findByIdAndUpdate(
      id,
      {
        ...(products && { products }),
        ...(delivery && { delivery }),
        ...(priceInfo && { priceInfo }),
        ...(destinationCountry && { destinationCountry }),
        ...(products && { totalAmount })
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Kayıt bulunamadı" });
    }

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error("UPDATE_PRICE_QUOTE_ERROR:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deletePriceQuote = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await PriceQuote.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Kayıt bulunamadı" });
    }

    res.status(200).json({
      success: true,
      message: "Silindi"
    });
  } catch (error) {
    console.error("DELETE_PRICE_QUOTE_ERROR:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
