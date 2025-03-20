import mongoose from "mongoose";

const billItemSchema = new mongoose.Schema({
  product: {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true }, // เพิ่ม type
    image: { type: String },
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"],
  },
  endDate: {
    type: String,
    required: [true, "endDate is required for each item"],
    match: [/^\d{4}-\d{2}-\d{2}$/, "endDate must be in format YYYY-MM-DD"],
  },
});

const billSchema = new mongoose.Schema({
  billNumber: { type: String, unique: true },
  items: [billItemSchema],
  totalItems: { type: Number, required: true, default: 0 },
  inDate: {
    type: String,
    default: () => {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    },
    match: [/^\d{4}-\d{2}-\d{2}$/, "inDate must be in format YYYY-MM-DD"],
  },
});

billSchema.pre("save", async function (next) {
  if (!this.billNumber) {
    let isUnique = false;
    let newBillNumber;

    while (!isUnique) {
      newBillNumber = Math.floor(10000000 + Math.random() * 90000000).toString();
      const existingBill = await mongoose.model("Bill", billSchema).findOne({ billNumber: newBillNumber });
      if (!existingBill) {
        isUnique = true;
      }
    }

    this.billNumber = newBillNumber;
  }

  this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);
  next();
});

const Bill = mongoose.model("Bill", billSchema);
export default Bill;