import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

// Get all users
export async function GET(request: Request) {
  try {
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // Get all users from the database
    const users = await db.collection('users')
      .find({})
      .project({ password: 0 }) // Exclude passwords from response
      .toArray();
    
    // Format the response
    const formattedUsers = users.map(user => ({
      ...user,
      id: user._id.toString(), // Add string ID for client-side use
    }));
    
    return NextResponse.json(formattedUsers, { status: 200 });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    return NextResponse.json(
      { message: 'Falha ao buscar usuários' }, 
      { status: 500 }
    );
  }
} 