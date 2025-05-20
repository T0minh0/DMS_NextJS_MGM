import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET() {
  try {
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // Get all users
    const users = await db.collection('users').find({}).toArray();
    
    // Return users data, omitting sensitive fields
    const safeUsersData = users.map(user => {
      const { password, ...safeUserData } = user;
      return safeUserData;
    });
    
    console.log(`Found ${safeUsersData.length} users`);
    
    return NextResponse.json(safeUsersData);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { message: 'Error fetching users data' },
      { status: 500 }
    );
  }
} 