import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// This endpoint will try multiple ways to find the example wastepicker
export async function GET() {
  try {
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    const results = {};
    
    // Try finding wastepicker with ID "WP005"
    try {
      results.byWastepickerId = await db.collection('wastepickers').findOne({ wastepicker_id: "WP005" });
    } catch (err) {
      results.byWastepickerId = { error: String(err) };
    }
    
    // Try finding user with CPF "56789012345"
    try {
      results.byCpf = await db.collection('users').findOne({ cpf: "56789012345" });
    } catch (err) {
      results.byCpf = { error: String(err) };
    }
    
    // Try finding by ObjectId
    try {
      results.byObjectId = await db.collection('users').findOne({ _id: new ObjectId("67fe65f101ef7b5bde6e19c7") });
    } catch (err) {
      results.byObjectId = { error: String(err) };
    }
    
    // Try all collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    results.collections = collectionNames;
    
    // Try direct DB query
    try {
      const rawUser = {
        "_id": "67fe65f101ef7b5bde6e19c7",
        "cpf": "56789012345",
        "full_name": "Carlos Ferreira",
        "coopeative_id": "1",
        "wastepicker_id": "WP005",
        "user_type": 0,
        "Birth date": "1975-07-18T00:00:00.000+00:00",
        "Entry date": "2018-06-01T00:00:00.000+00:00",
        "PIS": "567890123",
        "RG": "56789012",
        "gender": "M",
        "password": "$2a$12$zLcmf1CCg9AOnR3BNI4iFOKHIDsW6PBE.sYhdqQjaOGLRy7D7klmG"
      };
      
      // Insert this user if it doesn't exist
      results.insertAttempt = await db.collection('users').updateOne(
        { _id: "67fe65f101ef7b5bde6e19c7" },
        { $setOnInsert: rawUser },
        { upsert: true }
      );
      
      // Check if the user exists now
      results.afterInsert = await db.collection('users').findOne({ _id: "67fe65f101ef7b5bde6e19c7" });
    } catch (err) {
      results.insertError = String(err);
    }
    
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    return NextResponse.json(
      { message: 'Error in debug endpoint', error: String(error) },
      { status: 500 }
    );
  }
} 