const { mongoose } = require('../db/mongo');
const { unixNow } = require('../utils/time');

const productDocumentSchema = new mongoose.Schema(
  {
    sqlProductId: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },
    tags: [String],
    stock: {
      type: Number,
      default: 0,
      min: 0
    },
    attributes: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {}
    },
    warehouse: String,
    sourceServer: String,
    created_at: {
      type: Number,
      default: unixNow
    },
    updated_at: {
      type: Number,
      default: unixNow
    }
  },
  {
    strict: false,
    collection: 'product_documents'
  }
);

productDocumentSchema.pre('save', function updateUnixTimestamps(next) {
  const now = unixNow();
  if (this.isNew && !this.created_at) this.created_at = now;
  this.updated_at = now;
  next();
});

function cleanProductDocument(document) {
  if (!document) return null;
  const productDocument = document.toObject({ versionKey: false, flattenMaps: true });
  productDocument.id = String(productDocument._id);
  delete productDocument._id;
  return productDocument;
}

module.exports = {
  ProductDocument: mongoose.model('ProductDocument', productDocumentSchema),
  cleanProductDocument
};
