import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET() {
  try {
    console.log('API: Connecting to MongoDB for materials...');
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    console.log('API: Connected to database');
    
    // Log available collections to verify the database structure
    const collections = await db.listCollections().toArray();
    console.log('API: Available collections:', collections.map(c => c.name));
    
    // Use the materials collection that actually exists
    const materialsCollection = db.collection('materials');
    
    console.log('API: Querying materials collection...');
    
    // Get a sample document to understand its structure
    const sampleMaterial = await materialsCollection.findOne();
    console.log('API: Sample material:', sampleMaterial);
    
    const materials = await materialsCollection.find({}).sort({ name: 1 }).toArray();
    
    console.log(`API: Found ${materials.length} materials.`);
    if (materials.length > 0) {
      console.log('API: First material:', materials[0]);
      
      // Convert ObjectId to string if needed
      const formattedMaterials = materials.map(material => ({
        ...material,
        _id: material._id.toString(),
        // Add material_id field if it doesn't exist (using _id as string)
        material_id: material.material_id || material._id.toString(),
        // Ensure name field exists
        name: material.name || material.material || `Material ${material.material_id || material._id}`
      }));
      
      return NextResponse.json(formattedMaterials);
    } else {
      console.log('API: No materials found in database');
      
      // Return error response if no materials found
      return NextResponse.json(
        { error: 'No materials available', details: 'No materials were found in the database' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error fetching materials:', error);
    return NextResponse.json(
      { error: 'Failed to fetch materials', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 