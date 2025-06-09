import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    const body = await request.json();
    
    // Extract user data from request body
    const { 
      id,
      full_name, 
      email, 
      phone, 
      PIS, 
      RG, 
      user_type, 
      password 
    } = body;
    
    // Validate required fields
    if (!id || !full_name) {
      return NextResponse.json(
        { message: 'ID e nome são obrigatórios' }, 
        { status: 400 }
      );
    }
    
    // Check if user exists
    const existingUser = await db.collection('users').findOne({ 
      $or: [
        { _id: new ObjectId(id) },
        { id: id }
      ]
    });
    
    if (!existingUser) {
      return NextResponse.json(
        { message: 'Usuário não encontrado' }, 
        { status: 404 }
      );
    }
    
    // Prepare update object
    const updateData: any = {
      full_name,
      email,
      phone,
      PIS,
      RG,
      user_type: Number(user_type),
      updated_at: new Date()
    };
    
    // If password is provided, hash it
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }
    
    // Update user in database
    const result = await db.collection('users').updateOne(
      { $or: [
        { _id: new ObjectId(id) },
        { id: id }
      ]},
      { $set: updateData }
    );
    
    if (!result.matchedCount) {
      return NextResponse.json(
        { message: 'Usuário não encontrado' }, 
        { status: 404 }
      );
    }
    
    if (!result.modifiedCount && !result.upsertedCount) {
      return NextResponse.json(
        { message: 'Nenhuma alteração feita' }, 
        { status: 304 }
      );
    }
    
    return NextResponse.json({
      message: 'Usuário atualizado com sucesso'
    }, { status: 200 });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { message: 'Erro ao atualizar usuário' }, 
      { status: 500 }
    );
  }
} 