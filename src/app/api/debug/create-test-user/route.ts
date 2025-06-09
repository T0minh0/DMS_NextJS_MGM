import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import bcrypt from 'bcryptjs';

export async function GET(request: Request) {
  try {
    // In a production environment, this route should be protected or removed
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { message: 'This route is not available in production' },
        { status: 403 }
      );
    }

    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // Hash the test password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('test123', salt);
    
    // Create test user data
    const testUser = {
      cpf: '12345678900',
      full_name: 'Test User',
      user_type: 1,
      password_hash: hashedPassword,
      created_at: new Date()
    };
    
    // Check if test user already exists
    const existingUser = await db.collection('users').findOne({ cpf: testUser.cpf });
    
    if (existingUser) {
      // Update existing test user
      await db.collection('users').updateOne(
        { cpf: testUser.cpf },
        { $set: { password_hash: hashedPassword, updated_at: new Date() } }
      );
      
      return NextResponse.json({
        message: 'Test user updated successfully',
        credentials: {
          cpf: testUser.cpf,
          password: 'test123'
        }
      });
    } else {
      // Create new test user
      const result = await db.collection('users').insertOne(testUser);
      
      return NextResponse.json({
        message: 'Test user created successfully',
        userId: result.insertedId,
        credentials: {
          cpf: testUser.cpf,
          password: 'test123'
        }
      });
    }
  } catch (error) {
    console.error('Error creating test user:', error);
    return NextResponse.json(
      { message: 'Server error', error: String(error) },
      { status: 500 }
    );
  }
} 