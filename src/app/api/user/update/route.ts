import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, full_name, email, phone, PIS, RG } = body;
    
    if (!id) {
      return NextResponse.json(
        { message: 'ID do usuário é obrigatório' },
        { status: 400 }
      );
    }
    
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // Prepare update data
    const updateData = {
      updated_at: new Date()
    };
    
    // Add fields if provided
    if (full_name) updateData['full_name'] = full_name;
    if (email) updateData['email'] = email;
    if (phone) updateData['phone'] = phone;
    if (PIS) updateData['PIS'] = PIS.replace(/\D/g, ''); // Remove non-numeric characters
    if (RG) updateData['RG'] = RG.replace(/\D/g, ''); // Remove non-numeric characters
    
    // Try to update the user with ObjectId
    let result;
    try {
      result = await db.collection('users').updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
    } catch (e) {
      // If that fails, try with string ID
      result = await db.collection('users').updateOne(
        { _id: id },
        { $set: updateData }
      );
    }
    
    // Check if user was updated
    if (result.matchedCount === 0) {
      return NextResponse.json(
        { message: 'Usuário não encontrado' },
        { status: 404 }
      );
    }
    
    // Log limited information
    console.log('User profile updated:', {
      id,
      updated_fields: Object.keys(updateData).filter(key => key !== 'updated_at')
    });
    
    return NextResponse.json({ 
      message: 'Perfil atualizado com sucesso',
      updated: result.modifiedCount > 0
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json(
      { message: 'Erro ao atualizar perfil' },
      { status: 500 }
    );
  }
} 