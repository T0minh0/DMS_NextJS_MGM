import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

// Function to generate the next wastepicker_id
async function generateWastepickerId(db: any, existingIds: Set<string>): Promise<string> {
  let counter = 1;
  let wastepickerId: string;
  
  do {
    wastepickerId = `WP${counter.toString().padStart(3, '0')}`;
    counter++;
  } while (existingIds.has(wastepickerId));
  
  return wastepickerId;
}

export async function POST(request: Request) {
  try {
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    console.log('Starting wastepicker_id assignment for existing workers...');
    
    // Find all workers (user_type = 1) without wastepicker_id
    const workersWithoutId = await db.collection('users').find({
      user_type: 1,
      $or: [
        { wastepicker_id: { $exists: false } },
        { wastepicker_id: null },
        { wastepicker_id: "" }
      ]
    }).toArray();
    
    console.log(`Found ${workersWithoutId.length} workers without wastepicker_id`);
    
    if (workersWithoutId.length === 0) {
      return NextResponse.json({
        message: 'Todos os catadores já possuem wastepicker_id',
        updated: 0
      });
    }
    
    // Get all existing wastepicker_ids to avoid duplicates
    const existingWorkers = await db.collection('users').find({
      wastepicker_id: { $exists: true, $ne: null, $ne: "" }
    }).toArray();
    
    const existingIds = new Set<string>(
      existingWorkers.map(worker => worker.wastepicker_id).filter(Boolean)
    );
    
    console.log(`Found ${existingIds.size} existing wastepicker_ids:`, Array.from(existingIds));
    
    // Assign wastepicker_id to each worker
    const updates = [];
    const assignments = [];
    
    for (const worker of workersWithoutId) {
      const wastepickerId = await generateWastepickerId(db, existingIds);
      existingIds.add(wastepickerId); // Add to set to avoid duplicates in this batch
      
      assignments.push({
        userId: worker._id,
        name: worker.full_name,
        wastepickerId
      });
      
      updates.push({
        updateOne: {
          filter: { _id: worker._id },
          update: { $set: { wastepicker_id: wastepickerId } }
        }
      });
      
      console.log(`Assigning ${wastepickerId} to ${worker.full_name}`);
    }
    
    // Execute bulk update
    const result = await db.collection('users').bulkWrite(updates);
    
    console.log(`Successfully updated ${result.modifiedCount} workers`);
    
    return NextResponse.json({
      message: `Wastepicker IDs atribuídos com sucesso para ${result.modifiedCount} catadores`,
      updated: result.modifiedCount,
      assignments: assignments
    });
    
  } catch (error) {
    console.error('Error assigning wastepicker_ids:', error);
    return NextResponse.json(
      { 
        error: 'Erro ao atribuir wastepicker_ids',
        details: error instanceof Error ? error.message : String(error)
      }, 
      { status: 500 }
    );
  }
} 