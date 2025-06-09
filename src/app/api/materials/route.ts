import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    console.log('API: Connecting to MongoDB for materials...');
    console.log('API: Connected to database');
    
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    console.log('API: Available collections:', collectionNames);
    
    if (!collectionNames.includes('materials')) {
      console.log('API: No materials collection found');
      return NextResponse.json([]);
    }
    
    const materialsCollection = db.collection('materials');
    
    console.log('API: Querying materials collection...');
    
    // Get a sample document to understand the structure
    const sampleDoc = await materialsCollection.findOne({});
    if (sampleDoc) {
      console.log('API: Sample document structure:', {
        _id: sampleDoc._id,
        material: sampleDoc.material,
        material_id: sampleDoc.material_id,
        group: sampleDoc.group
      });
    }
    
    // Get all materials
    const materials = await materialsCollection.find({}).toArray();
    console.log(`API: Found ${materials.length} materials`);
    
    // Get unique groups
    const uniqueGroups = [...new Set(materials.map(m => m.group).filter(Boolean))];
    console.log('API: Unique groups found:', uniqueGroups);
    
    // Add group objects to the response (for compatibility with existing UI)
    const groupObjects = uniqueGroups.map(group => ({
      _id: `group-${group}`,
      group,
      isGroup: true
    }));
    
    const result = [...groupObjects, ...materials];
    console.log(`API: Returning ${result.length} total items (${groupObjects.length} groups + ${materials.length} materials)`);
    
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error fetching materials:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch materials',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.material || !body.group) {
      return NextResponse.json({ 
        error: 'Nome do material e grupo são obrigatórios' 
      }, { status: 400 });
    }

    const client = await clientPromise;
    const db = getDbFromClient(client);
    const materialsCollection = db.collection('materials');

    // Check if material already exists
    const existingMaterial = await materialsCollection.findOne({ 
      material: { $regex: new RegExp(`^${body.material.trim()}$`, 'i') }
    });

    if (existingMaterial) {
      return NextResponse.json({ 
        error: 'Este material já existe' 
      }, { status: 400 });
    }

    // Generate next material_id
    const lastMaterial = await materialsCollection
      .findOne({}, { sort: { material_id: -1 } });
    
    let nextId = 1;
    if (lastMaterial && lastMaterial.material_id) {
      nextId = lastMaterial.material_id + 1;
    }

    // Prepare material document
    const materialDocument = {
      material_id: nextId,
      material: body.material.trim(),
      group: body.group.trim(),
      price_per_kg: body.price_per_kg || undefined,
      created_at: new Date(),
      updated_at: new Date()
    };

    console.log('API: Creating material:', JSON.stringify(materialDocument, null, 2));

    const result = await materialsCollection.insertOne(materialDocument);

    if (!result.insertedId) {
      throw new Error('Failed to insert material document');
    }

    console.log(`API: Material created with ID: ${result.insertedId}`);

    return NextResponse.json({
      success: true,
      message: 'Material criado com sucesso',
      materialId: result.insertedId,
      material: { ...materialDocument, _id: result.insertedId }
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating material:', error);
    return NextResponse.json({ 
      error: 'Erro ao criar material',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 