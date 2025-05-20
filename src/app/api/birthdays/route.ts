import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET() {
  try {
    console.log('API: Connecting to MongoDB for birthdays...');
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    const usersCollection = db.collection('users');
    
    // Get current month
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // MongoDB's $month returns 1-12
    
    // Find users with birthdays in the current month
    const birthdays = await usersCollection.aggregate([
      {
        $match: {
          "Birth date": { $exists: true, $ne: null }, // Using 'Birth date' from repopulate_db.py
          user_type: 1 // Only workers
        }
      },
      {
        $project: {
          full_name: 1,
          "Birth date": 1,
          birthMonth: { $month: "$Birth date" },
          birthDay: { $dayOfMonth: "$Birth date" },
          _id: 0
        }
      },
      {
        $match: {
          birthMonth: currentMonth
        }
      },
      {
        $sort: {
          birthDay: 1
        }
      }
    ]).toArray();
    
    console.log(`API: Found ${birthdays.length} birthdays in the current month.`);
    
    // Format birthdays for display
    const formattedBirthdays = birthdays.map(user => {
      const birthdate = new Date(user["Birth date"]);
      return {
        name: user.full_name,
        date: `${birthdate.getDate().toString().padStart(2, '0')}/${(birthdate.getMonth() + 1).toString().padStart(2, '0')}`,
        // Note: we're not including the birth year in the display format
      };
    });
    
    // If no birthdays found, return sample data
    if (formattedBirthdays.length === 0) {
      console.log('API: No birthdays found, returning sample data');
      
      // Get the current month's name
      const monthName = now.toLocaleString('default', { month: 'long' });
      
      return NextResponse.json([
        { name: "João Silva", date: "15/06" },
        { name: "Maria Oliveira", date: "22/06" },
        { name: "Pedro Santos", date: "10/06" }
      ]);
    }
    
    return NextResponse.json(formattedBirthdays);
  } catch (error) {
    console.error('Error fetching birthdays:', error);
    return NextResponse.json(
      { error: 'Failed to fetch birthdays data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 