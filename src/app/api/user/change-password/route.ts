import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, currentPassword, newPassword } = body;
    
    if (!id || !currentPassword || !newPassword) {
      return NextResponse.json(
        { message: 'Todos os campos são obrigatórios' },
        { status: 400 }
      );
    }
    
    // Validate new password
    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: 'A nova senha deve ter pelo menos 6 caracteres' },
        { status: 400 }
      );
    }
    
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // Find the user
    let user;
    try {
      user = await db.collection('users').findOne({ _id: new ObjectId(id) });
    } catch (e) {
      user = await db.collection('users').findOne({ _id: id });
    }
    
    if (!user) {
      return NextResponse.json(
        { message: 'Usuário não encontrado' },
        { status: 404 }
      );
    }
    
    // Verify current password
    let isCurrentPasswordValid = false;
    
    // If we have a hashed password in the database
    if (user.password_hash) {
      isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    } 
    // If we have a password field that starts with $2a$ or $2b$ (bcrypt hash format)
    else if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
      isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    }
    // If we have a plain text password in the database (legacy case)
    else if (user.password) {
      isCurrentPasswordValid = currentPassword === user.password;
    }
    
    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        { message: 'Senha atual incorreta' },
        { status: 401 }
      );
    }
    
    // Hash the new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Determine where to store the new password based on what's already in the database
    let updateQuery = {};
    
    if (user.password_hash) {
      // If there's already a password_hash field, update it
      updateQuery = { 
        $set: { 
          password_hash: hashedPassword,
          updated_at: new Date()
        }
      };
    } else if (user.password) {
      // If there's only a password field, update it but also add password_hash
      updateQuery = { 
        $set: { 
          password: hashedPassword,
          password_hash: hashedPassword,
          updated_at: new Date()
        }
      };
    } else {
      // If neither exists (shouldn't happen), create both
      updateQuery = { 
        $set: { 
          password: hashedPassword,
          password_hash: hashedPassword,
          updated_at: new Date()
        }
      };
    }
    
    // Update the user's password
    const result = await db.collection('users').updateOne(
      { _id: user._id },
      updateQuery
    );
    
    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { message: 'Nenhuma alteração feita' },
        { status: 400 }
      );
    }
    
    // Log success without revealing sensitive information
    console.log('User password updated:', {
      id: user._id,
      timestamp: new Date()
    });
    
    return NextResponse.json({ 
      message: 'Senha atualizada com sucesso'
    });
  } catch (error) {
    console.error('Error updating password:', error);
    return NextResponse.json(
      { message: 'Erro ao atualizar senha' },
      { status: 500 }
    );
  }
} 