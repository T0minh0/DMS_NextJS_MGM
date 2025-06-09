import mongoose from 'mongoose';

// Connect to MongoDB using Mongoose
const connectMongo = async () => {
  if (mongoose.connection.readyState >= 1) {
    return; // Already connected
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  return mongoose.connect(process.env.MONGODB_URI);
};

// Define schemas and models

// Material Schema
const MaterialSchema = new mongoose.Schema({
  material_id: { type: Number, required: true, unique: true },
  material: { type: String, required: true },
  group: { type: String, required: false },
}, { collection: 'materials' });

// User/Worker Schema
const UserSchema = new mongoose.Schema({
  wastepicker_id: { type: Number, unique: true, sparse: true },
  user_id: { type: Number, required: true, unique: true },
  user_type: { type: Number, required: true }, // 1 for wastepicker/worker
  username: { type: String, required: true, unique: true },
  password_hash: String,
  full_name: String,
  email: String,
  phone: String,
  birthdate: Date,
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
}, { collection: 'users' });

// Stock Schema
const StockSchema = new mongoose.Schema({
  material_id: { type: Number, required: true, ref: 'Material' },
  weight: { type: Number, required: true },
  date: { type: Date, default: Date.now }
}, { collection: 'stock' });

// Collection Schema (Worker Collections)
const CollectionSchema = new mongoose.Schema({
  wastepicker_id: { type: Number, required: true, ref: 'User' },
  material_id: { type: Number, required: true, ref: 'Material' },
  weight: { type: Number, required: true },
  date: { type: Date, default: Date.now }
}, { collection: 'collections' });

// Price Schema
const PriceSchema = new mongoose.Schema({
  material_id: { type: Number, required: true, ref: 'Material' },
  price: { type: Number, required: true },
  date: { type: Date, default: Date.now }
}, { collection: 'prices' });

// Create models if they don't exist
const models = {} as Record<string, mongoose.Model<any>>;

export function getModel(modelName: string) {
  if (models[modelName]) {
    return models[modelName];
  }

  if (mongoose.models[modelName]) {
    models[modelName] = mongoose.models[modelName];
    return models[modelName];
  }

  switch (modelName) {
    case 'Material':
      models[modelName] = mongoose.model('Material', MaterialSchema);
      break;
    case 'User':
      models[modelName] = mongoose.model('User', UserSchema);
      break;
    case 'Stock':
      models[modelName] = mongoose.model('Stock', StockSchema);
      break;
    case 'Collection':
      models[modelName] = mongoose.model('Collection', CollectionSchema);
      break;
    case 'Price':
      models[modelName] = mongoose.model('Price', PriceSchema);
      break;
    default:
      throw new Error(`Model ${modelName} not found`);
  }

  return models[modelName];
}

export { connectMongo }; 