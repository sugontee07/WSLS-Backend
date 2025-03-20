import mongoose from "mongoose";

const cellSchema = new mongoose.Schema({
  cellId: {
    type: String,
    required: [true, "Cell ID is required"],
    unique: true,
  },
  col: {
    type: String,
  },
  row: {
    type: String,
  },
  divisionType: {
    type: String,
    enum: ["single", "dual"],
    default: "single",
  },
  status: {
    type: Number,
    default: 1,
  },
  products: [
    {
      productId: { type: String, required: true },
      image: { type: String },
      name: { type: String },
      location: { type: String },
      inDate: { type: String },
      endDate: { type: String },
      quantity: { type: Number, required: true },
    },
  ],
  subCellsA: {
    label: { type: String },
    status: { type: Number, default: 1 },
    products: [
      {
        productId: { type: String, required: true },
        image: { type: String },
        name: { type: String },
        location: { type: String },
        inDate: { type: String },
        endDate: { type: String },
        quantity: { type: Number, required: true },
      },
    ],
  },
  subCellsB: {
    label: { type: String },
    status: { type: Number, default: 1 },
    products: [
      {
        productId: { type: String, required: true },
        image: { type: String },
        name: { type: String },
        location: { type: String },
        inDate: { type: String },
        endDate: { type: String },
        quantity: { type: Number, required: true },
      },
    ],
  },
  total: {
    type: Number,
    default: 0,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

const Cell = mongoose.model("Cell", cellSchema);
export default Cell;