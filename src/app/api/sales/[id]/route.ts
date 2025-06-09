import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const saleId = params.id;

    // Validate ObjectId
    if (!ObjectId.isValid(saleId)) {
      return NextResponse.json({ 
        error: 'ID de venda inválido' 
      }, { status: 400 });
    }

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
    const salesCollection = db.collection('sales');

    // Check if sale exists
    const existingSale = await salesCollection.findOne({ _id: new ObjectId(saleId) });
    if (!existingSale) {
      return NextResponse.json({ 
        error: 'Venda não encontrada' 
      }, { status: 404 });
    }

    // For updates, we need to check stock considering the original sale
    // Check stock availability (add back the original sold amount)
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
        let availableStock = stockData[materialName] || 0;
        
        // If updating the same material, add back the original amount
        if (existingSale.material_id === body.material_id.toString()) {
          availableStock += existingSale.weight_sold;
        }
        
        if (body.weight_sold > availableStock) {
          return NextResponse.json({ 
            error: `Estoque insuficiente! Disponível: ${availableStock.toFixed(2)} kg` 
          }, { status: 400 });
        }
      }
    }

    // Prepare update document
    const updateDocument = {
      material_id: body.material_id.toString(),
      cooperative_id: body.cooperative_id.toString(),
      'price/kg': parseFloat(body['price/kg']),
      weight_sold: parseFloat(body.weight_sold),
      date: new Date(body.date),
      Buyer: body.Buyer.trim(),
      updated_at: new Date()
    };

    console.log('API: Updating sale:', JSON.stringify(updateDocument, null, 2));

    const result = await salesCollection.updateOne(
      { _id: new ObjectId(saleId) },
      { $set: updateDocument }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ 
        error: 'Venda não encontrada' 
      }, { status: 404 });
    }

    console.log(`API: Sale updated successfully: ${saleId}`);

    return NextResponse.json({
      success: true,
      message: 'Venda atualizada com sucesso',
      sale: { ...updateDocument, _id: saleId }
    });

  } catch (error) {
    console.error('Error updating sale:', error);
    return NextResponse.json({ 
      error: 'Erro ao atualizar venda',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const saleId = params.id;

    // Validate ObjectId
    if (!ObjectId.isValid(saleId)) {
      return NextResponse.json({ 
        error: 'ID de venda inválido' 
      }, { status: 400 });
    }

    const client = await clientPromise;
    const db = getDbFromClient(client);
    const salesCollection = db.collection('sales');

    // Check if sale exists before deleting
    const existingSale = await salesCollection.findOne({ _id: new ObjectId(saleId) });
    if (!existingSale) {
      return NextResponse.json({ 
        error: 'Venda não encontrada' 
      }, { status: 404 });
    }

    console.log(`API: Deleting sale: ${saleId}`);

    const result = await salesCollection.deleteOne({ _id: new ObjectId(saleId) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ 
        error: 'Venda não encontrada' 
      }, { status: 404 });
    }

    console.log(`API: Sale deleted successfully: ${saleId}`);

    return NextResponse.json({
      success: true,
      message: 'Venda excluída com sucesso'
    });

  } catch (error) {
    console.error('Error deleting sale:', error);
    return NextResponse.json({ 
      error: 'Erro ao excluir venda',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 