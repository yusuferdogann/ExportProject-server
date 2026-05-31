const { generateInvoicePdf } = require("../services/pdfService");

const testPdf = async (req, res) => {
  try {
    console.log("TEST PDF CONTROLLER CALLED");

    const invoiceData = {
      invoiceNo: "TEST-001",
      invoiceDate: new Date(),
      delivery: "EXW",
      destinationCountry: "DE",
      gtip: "1234.56.78",
      bank: {
        name: "Akbank",
        branch: "Levent",
        swift: "AKBKTRIS",
        iban: "TR12 3456 7890 1234 5678 9012 34"
      },
      products: [
        { description: "Product A", quantity: 10, unit: "pcs", unitPrice: 15, total: 150 },
        { description: "Product B", quantity: 5, unit: "pcs", unitPrice: 20, total: 100 }
      ],
      totalAmount: 250
    };

    const pdfBuffer = await generateInvoicePdf(invoiceData);

    // 🔥 EN KRİTİK SATIR
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length
    });

    return res.end(pdfBuffer);

  } catch (error) {
    console.error("TEST PDF ERROR:", error);
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { testPdf };