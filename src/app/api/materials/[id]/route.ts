import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const materialId = params.id;

    // Validate ObjectId
    if (!ObjectId.isValid(materialId)) {
      return NextResponse.json({ 
        error: 'ID de material inválido' 
      }, { status: 400 });
    }

    // Validate required fields
    if (!body.material || !body.group) {
      return NextResponse.json({ 
        error: 'Nome do material e grupo são obrigatórios' 
      }, { status: 400 });
    }

    const client = await clientPromise;
    const db = getDbFromClient(client);
    const materialsCollection = db.collection('materials');

    // Check if material exists
    const existingMaterial = await materialsCollection.findOne({ _id: new ObjectId(materialId) });
    if (!existingMaterial) {
      return NextResponse.json({ 
        error: 'Material não encontrado' 
      }, { status: 404 });
    }

    // Check if another material with the same name already exists (excluding current one)
    const duplicateMaterial = await materialsCollection.findOne({ 
      material: { $regex: new RegExp(`^${body.material.trim()}$`, 'i') },
      _id: { $ne: new ObjectId(materialId) }
    });

    if (duplicateMaterial) {
      return NextResponse.json({ 
        error: 'Já existe outro material com este nome' 
      }, { status: 400 });
    }

    // Prepare update document
    const updateDocument = {
      material: body.material.trim(),
      group: body.group.trim(),
      price_per_kg: body.price_per_kg || undefined,
      updated_at: new Date()
    };

    console.log('API: Updating material:', JSON.stringify(updateDocument, null, 2));

    const result = await materialsCollection.updateOne(
      { _id: new ObjectId(materialId) },
      { $set: updateDocument }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ 
        error: 'Material não encontrado' 
      }, { status: 404 });
    }

    console.log(`API: Material updated successfully: ${materialId}`);

    return NextResponse.json({
      success: true,
      message: 'Material atualizado com sucesso',
      material: { ...updateDocument, _id: materialId, material_id: existingMaterial.material_id }
    });

  } catch (error) {
    console.error('Error updating material:', error);
    return NextResponse.json({ 
      error: 'Erro ao atualizar material',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const materialId = params.id;

    // Validate ObjectId
    if (!ObjectId.isValid(materialId)) {
      return NextResponse.json({ 
        error: 'ID de material inválido' 
      }, { status: 400 });
    }

    const client = await clientPromise;
    const db = getDbFromClient(client);
    const materialsCollection = db.collection('materials');

    // Check if material exists before deleting
    const existingMaterial = await materialsCollection.findOne({ _id: new ObjectId(materialId) });
    if (!existingMaterial) {
      return NextResponse.json({ 
        error: 'Material não encontrado' 
      }, { status: 404 });
    }

    // Check if material is being used in measurements or sales
    const measurementsCollection = db.collection('measurements');
    const salesCollection = db.collection('sales');

    const measurementUsage = await measurementsCollection.findOne({ 
      material_id: existingMaterial.material_id.toString() 
    });
    
    const salesUsage = await salesCollection.findOne({ 
      material_id: existingMaterial.material_id.toString() 
    });

    if (measurementUsage || salesUsage) {
      return NextResponse.json({ 
        error: 'Este material não pode ser excluído pois está sendo usado em medições ou vendas' 
      }, { status: 400 });
    }

    console.log(`API: Deleting material: ${materialId}`);

    const result = await materialsCollection.deleteOne({ _id: new ObjectId(materialId) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ 
        error: 'Material não encontrado' 
      }, { status: 404 });
    }

    console.log(`API: Material deleted successfully: ${materialId}`);

    return NextResponse.json({
      success: true,
      message: 'Material excluído com sucesso'
    });

  } catch (error) {
    console.error('Error deleting material:', error);
    return NextResponse.json({ 
      error: 'Erro ao excluir material',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 