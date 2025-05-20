import { MongoClient, MongoClientOptions } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

const uri = process.env.MONGODB_URI;
console.log('MongoDB URI exists:', !!process.env.MONGODB_URI);
console.log('MongoDB URI starts with:', process.env.MONGODB_URI?.substring(0, 10) + '...');

// Get database name from env or use default
const DATABASE_NAME = process.env.MONGODB_DB || 'DMS';
console.log('Using database name:', DATABASE_NAME);

const options: MongoClientOptions = {};

let client;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    console.log('Creating new MongoDB client in development mode');
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect().then(client => {
      console.log('MongoDB connected successfully in development mode');
      return client;
    }).catch(err => {
      console.error('MongoDB connection error in development mode:', err);
      throw err;
    });
  } else {
    console.log('Using existing MongoDB client from global in development mode');
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  console.log('Creating new MongoDB client in production mode');
  client = new MongoClient(uri, options);
  clientPromise = client.connect().then(client => {
    console.log('MongoDB connected successfully in production mode');
    return client;
  }).catch(err => {
    console.error('MongoDB connection error in production mode:', err);
    throw err;
  });
}

// Export a module-scoped MongoClient promise and helper function
export default clientPromise;

// Helper function to get database with the correct name
export function getDbFromClient(client: MongoClient) {
  return client.db(DATABASE_NAME);
} 