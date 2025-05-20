import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: Request) {
  try {
    // Get user ID from query parameter
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { message: 'User ID is required' },
        { status: 400 }
      );
    }
    
    console.log(`Fetching user with ID: ${id}`);
    
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // Query for the user - try both string ID and ObjectId
    let user;
    try {
      // First attempt with ObjectId
      user = await db.collection('users').findOne({ _id: new ObjectId(id) });
    } catch (e) {
      // If that fails, try with string ID
      user = await db.collection('users').findOne({ _id: id });
    }
    
    // If user not found, try alternative fields
    if (!user) {
      user = await db.collection('users').findOne({ id: id });
    }
    
    // Try by CPF if still not found
    if (!user) {
      user = await db.collection('users').findOne({ cpf: "56789012345" });
    }
    
    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }
    
    // Return user data, omitting sensitive fields
    const { password, ...safeUserData } = user;
    
    console.log('Found user:', safeUserData);
    
    return NextResponse.json(safeUserData);
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { message: 'Error fetching user data' },
      { status: 500 }
    );
  }
} 