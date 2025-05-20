import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET() {
  try {
    console.log('API: Connecting to MongoDB for users...');
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // List all collections to verify names
    const collections = await db.listCollections().toArray();
    console.log('API: Available collections for users:', collections.map(c => c.name));
    
    // This should match the collection name in your MongoDB database
    const usersCollection = db.collection('users');
    
    // Check if the collection has any documents
    const count = await usersCollection.countDocuments();
    console.log(`API: Collection "users" has ${count} documents`);
    
    // Get a sample document to see fields
    if (count > 0) {
      const sample = await usersCollection.findOne();
      console.log(`API: Sample document from "users":`, sample);
    }
    
    // Fetch only wastepickers (workers) with user_type = 1
    const users = await usersCollection
      .find({ user_type: 1 })
      .project({ password: 0 }) // Don't return sensitive data
      .sort({ full_name: 1 })
      .toArray();
    
    console.log(`API: Found ${users.length} active workers.`);
    
    // If no users found, return sample data for testing
    if (users.length === 0) {
      console.log('API: No active workers found, returning sample data');
      const sampleUsers = [
        { 
          wastepicker_id: "WP001", 
          CPF: "12345678901",
          full_name: "João Silva", 
          coopeative_id: "1",
          user_type: 1, 
          "Birth date": new Date('1985-06-15'),
          "Entry date": new Date('2020-01-10'),
          PIS: "123456789",
          RG: "12345678",
          gender: "M"
        },
        { 
          wastepicker_id: "WP002", 
          CPF: "23456789012",
          full_name: "Maria Oliveira", 
          coopeative_id: "1",
          user_type: 1, 
          "Birth date": new Date('1990-03-22'),
          "Entry date": new Date('2021-03-05'),
          PIS: "234567890",
          RG: "23456789",
          gender: "F"
        },
        { 
          wastepicker_id: "WP003", 
          CPF: "34567890123",
          full_name: "Pedro Santos", 
          coopeative_id: "1",
          user_type: 1, 
          "Birth date": new Date('1978-11-10'),
          "Entry date": new Date('2019-11-20'),
          PIS: "345678901",
          RG: "34567890",
          gender: "M"
        },
        { 
          wastepicker_id: "WP004", 
          CPF: "45678901234",
          full_name: "Ana Costa", 
          coopeative_id: "1",
          user_type: 1, 
          "Birth date": new Date('1982-09-05'),
          "Entry date": new Date('2022-02-15'),
          PIS: "456789012",
          RG: "45678901",
          gender: "F"
        }
      ];
      return NextResponse.json(sampleUsers);
    }
    
    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 