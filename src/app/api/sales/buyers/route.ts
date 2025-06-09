import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    const salesCollection = db.collection('sales');

    console.log('API: Fetching unique buyers from sales...');

    // Get unique buyers from sales collection
    const buyers = await salesCollection.distinct('Buyer');
    
    // Filter out null/empty values and sort alphabetically
    const validBuyers = buyers
      .filter(buyer => buyer && buyer.trim() !== '')
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    console.log(`API: Found ${validBuyers.length} unique buyers`);

    return NextResponse.json({
      buyers: validBuyers,
      count: validBuyers.length
    });

  } catch (error) {
    console.error('Error fetching buyers:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch buyers',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.buyer || !body.buyer.trim()) {
      return NextResponse.json({ 
        error: 'Nome do comprador é obrigatório' 
      }, { status: 400 });
    }

    const buyerName = body.buyer.trim();
    
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    const salesCollection = db.collection('sales');

    // Check if buyer already exists
    const existingBuyer = await salesCollection.findOne({ 
      Buyer: { $regex: new RegExp(`^${buyerName}$`, 'i') } 
    });

    if (existingBuyer) {
      return NextResponse.json({ 
        error: 'Este comprador já existe na lista' 
      }, { status: 400 });
    }

    console.log(`API: Buyer "${buyerName}" will be available for future sales`);

    // Note: We don't need to store buyers separately since they are managed
    // through the sales collection. This endpoint just validates the name.
    
    return NextResponse.json({
      success: true,
      message: 'Comprador estará disponível para próximas vendas',
      buyer: buyerName
    }, { status: 201 });

  } catch (error) {
    console.error('Error adding buyer:', error);
    return NextResponse.json({ 
      error: 'Erro ao adicionar comprador',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 