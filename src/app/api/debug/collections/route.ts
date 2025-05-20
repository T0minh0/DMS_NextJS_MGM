import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET() {
  try {
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // Get list of all collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    console.log('Available collections:', collectionNames);
    
    // For each collection, get a sample document
    const samples = {};
    
    for (const name of collectionNames) {
      try {
        const sampleDoc = await db.collection(name).findOne({});
        if (sampleDoc) {
          samples[name] = {
            fields: Object.keys(sampleDoc),
            sample: sampleDoc
          };
        }
      } catch (err) {
        console.error(`Error getting sample from ${name}:`, err);
        samples[name] = { error: 'Failed to get sample' };
      }
    }
    
    return NextResponse.json({
      collections: collectionNames,
      samples
    });
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json(
      { message: 'Error fetching collections', error: String(error) },
      { status: 500 }
    );
  }
} 