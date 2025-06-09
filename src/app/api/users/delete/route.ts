import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function POST(request: Request) {
  try {
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    const body = await request.json();
    
    // Extract user ID from request body
    const { id } = body;
    
    if (!id) {
      return NextResponse.json(
        { message: 'ID do usuário é obrigatório' }, 
        { status: 400 }
      );
    }
    
    // Delete user from database
    const result = await db.collection('users').deleteOne({
      $or: [
        { _id: new ObjectId(id) },
        { id: id }
      ]
    });
    
    if (!result.deletedCount) {
      return NextResponse.json(
        { message: 'Usuário não encontrado' }, 
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      message: 'Usuário excluído com sucesso'
    }, { status: 200 });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { message: 'Erro ao excluir usuário' }, 
      { status: 500 }
    );
  }
} 