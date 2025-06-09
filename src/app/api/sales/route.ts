import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('material_id');
    const cooperativeId = searchParams.get('cooperative_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limit = parseInt(searchParams.get('limit') || '100');

    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    const salesCollection = db.collection('sales');

    // Build query
    const query: any = {};
    
    if (materialId) {
      query.material_id = materialId;
    }
    
    if (cooperativeId) {
      query.cooperative_id = cooperativeId;
    }
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    console.log('API: Sales query:', JSON.stringify(query, null, 2));

    // Fetch sales with sorting (most recent first)
    const sales = await salesCollection
      .find(query)
      .sort({ date: -1 })
      .limit(limit)
      .toArray();

    console.log(`API: Found ${sales.length} sales records`);

    // Calculate summary statistics
    const totalSales = sales.length;
    const totalWeight = sales.reduce((sum, sale) => sum + sale.weight_sold, 0);
    const totalValue = sales.reduce((sum, sale) => sum + (sale.weight_sold * sale['price/kg']), 0);

    return NextResponse.json({
      sales,
      summary: {
        totalSales,
        totalWeight: parseFloat(totalWeight.toFixed(2)),
        totalValue: parseFloat(totalValue.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Error fetching sales:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch sales',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    const requiredFields = ['material_id', 'cooperative_id', 'price/kg', 'weight_sold', 'date', 'Buyer'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({ 
          error: `Campo obrigatório: ${field}` 
        }, { status: 400 });
      }
    }

    // Validate data types and values
    if (body.weight_sold <= 0) {
      return NextResponse.json({ 
        error: 'Peso vendido deve ser maior que zero' 
      }, { status: 400 });
    }

    if (body['price/kg'] <= 0) {
      return NextResponse.json({ 
        error: 'Preço por kg deve ser maior que zero' 
      }, { status: 400 });
    }

    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // Check stock availability
    const stockResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/stock`);
    if (stockResponse.ok) {
      const stockData = await stockResponse.json();
      
      // Get material name to check stock
      const materialsCollection = db.collection('materials');
      const material = await materialsCollection.findOne({ 
        material_id: body.material_id.toString() 
      });
      
      if (material) {
        const materialName = material.material || material.name || `Material ${body.material_id}`;
        const availableStock = stockData[materialName] || 0;
        
        if (body.weight_sold > availableStock) {
          return NextResponse.json({ 
            error: `Estoque insuficiente! Disponível: ${availableStock.toFixed(2)} kg` 
          }, { status: 400 });
        }
      }
    }

    const salesCollection = db.collection('sales');
    
    // Prepare sale document
    const saleDocument = {
      material_id: body.material_id.toString(),
      cooperative_id: body.cooperative_id.toString(),
      'price/kg': parseFloat(body['price/kg']),
      weight_sold: parseFloat(body.weight_sold),
      date: new Date(body.date),
      Buyer: body.Buyer.trim(),
      created_at: new Date(),
      updated_at: new Date()
    };

    console.log('API: Creating sale:', JSON.stringify(saleDocument, null, 2));

    const result = await salesCollection.insertOne(saleDocument);

    if (!result.insertedId) {
      throw new Error('Failed to insert sale document');
    }

    console.log(`API: Sale created with ID: ${result.insertedId}`);

    return NextResponse.json({
      success: true,
      message: 'Venda registrada com sucesso',
      saleId: result.insertedId,
      sale: { ...saleDocument, _id: result.insertedId }
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating sale:', error);
    return NextResponse.json({ 
      error: 'Erro ao registrar venda',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await client.connect();
    const db = client.db('DMS');
    
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('id');
    
    if (!saleId) {
      return NextResponse.json({ error: 'Sale ID is required' }, { status: 400 });
    }
    
    const updateData = await request.json();
    
    // Recalculate total value if weight or price changed
    if (updateData.weight_sold || updateData.price_per_kg) {
      const existingSale = await db.collection('sales').findOne({ _id: new ObjectId(saleId) });
      if (existingSale) {
        const weight = updateData.weight_sold || existingSale.weight_sold;
        const price = updateData.price_per_kg || existingSale.price_per_kg;
        updateData.total_value = parseFloat((weight * price).toFixed(2));
      }
    }
    
    const result = await db.collection('sales').updateOne(
      { _id: new ObjectId(saleId) },
      { $set: { ...updateData, updated_at: new Date() } }
    );
    
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }
    
    return NextResponse.json({
      message: 'Sale updated successfully',
      modifiedCount: result.modifiedCount
    });
    
  } catch (error) {
    console.error('Error updating sale:', error);
    return NextResponse.json({ 
      error: 'Failed to update sale',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    await client.close();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await client.connect();
    const db = client.db('DMS');
    
    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get('id');
    
    if (!saleId) {
      return NextResponse.json({ error: 'Sale ID is required' }, { status: 400 });
    }
    
    const result = await db.collection('sales').deleteOne({ _id: new ObjectId(saleId) });
    
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }
    
    return NextResponse.json({
      message: 'Sale deleted successfully',
      deletedCount: result.deletedCount
    });
    
  } catch (error) {
    console.error('Error deleting sale:', error);
    return NextResponse.json({ 
      error: 'Failed to delete sale',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    await client.close();
  }
} 