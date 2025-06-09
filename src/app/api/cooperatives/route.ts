import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    console.log('API: Connecting to MongoDB for cooperatives...');
    
    // Check available collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    console.log('API: Available collections:', collectionNames);
    
    let cooperatives = [];
    
    // Try to get cooperatives from the cooperatives collection first
    if (collectionNames.includes('cooperatives')) {
      const cooperativesCollection = db.collection('cooperatives');
      cooperatives = await cooperativesCollection.find({}).toArray();
      console.log(`API: Found ${cooperatives.length} cooperatives in cooperatives collection`);
    } else {
      // If no cooperatives collection, get unique cooperative_ids from sales
      console.log('API: No cooperatives collection found, extracting from sales...');
      const salesCollection = db.collection('sales');
      
      const uniqueCooperativeIds = await salesCollection.distinct('cooperative_id');
      
      // Create cooperative objects from IDs
      cooperatives = uniqueCooperativeIds
        .filter(id => id && id.toString().trim() !== '')
        .map(id => ({
          _id: id,
          cooperative_id: id.toString(),
          name: `Cooperativa ${id}`,
          created_from_sales: true
        }));
      
      console.log(`API: Created ${cooperatives.length} cooperative entries from sales data`);
    }
    
    // Ensure all cooperatives have required fields
    const formattedCooperatives = cooperatives.map(coop => ({
      _id: coop._id,
      cooperative_id: coop.cooperative_id?.toString() || coop._id.toString(),
      name: coop.name || coop.cooperative_name || coop.cooperative || `Cooperativa ${coop.cooperative_id || coop._id}`,
      contact: coop.contact || '',
      address: coop.address || '',
      created_from_sales: coop.created_from_sales || false
    }));
    
    // Sort by name
    formattedCooperatives.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    
    console.log(`API: Returning ${formattedCooperatives.length} cooperatives`);
    
    return NextResponse.json(formattedCooperatives);

  } catch (error) {
    console.error('Error fetching cooperatives:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch cooperatives',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ 
        error: 'Nome da cooperativa é obrigatório' 
      }, { status: 400 });
    }

    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    const cooperativesCollection = db.collection('cooperatives');

    // Generate cooperative_id (simple incremental approach)
    const lastCooperative = await cooperativesCollection
      .findOne({}, { sort: { cooperative_id: -1 } });
    
    let nextId = 1;
    if (lastCooperative && lastCooperative.cooperative_id) {
      const lastId = parseInt(lastCooperative.cooperative_id.toString());
      nextId = isNaN(lastId) ? 1 : lastId + 1;
    }

    // Prepare cooperative document
    const cooperativeDocument = {
      cooperative_id: nextId.toString(),
      name: body.name.trim(),
      contact: body.contact?.trim() || '',
      address: body.address?.trim() || '',
      created_at: new Date(),
      updated_at: new Date()
    };

    console.log('API: Creating cooperative:', JSON.stringify(cooperativeDocument, null, 2));

    const result = await cooperativesCollection.insertOne(cooperativeDocument);

    if (!result.insertedId) {
      throw new Error('Failed to insert cooperative document');
    }

    console.log(`API: Cooperative created with ID: ${result.insertedId}`);

    return NextResponse.json({
      success: true,
      message: 'Cooperativa criada com sucesso',
      cooperativeId: result.insertedId,
      cooperative: { ...cooperativeDocument, _id: result.insertedId }
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating cooperative:', error);
    return NextResponse.json({ 
      error: 'Erro ao criar cooperativa',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 