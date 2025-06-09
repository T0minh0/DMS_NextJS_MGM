import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import bcrypt from 'bcryptjs';

// Function to generate the next wastepicker_id
async function generateWastepickerId(db: any): Promise<string> {
  try {
    // Find the highest existing wastepicker_id
    const lastWorker = await db.collection('users').findOne(
      { wastepicker_id: { $exists: true, $ne: null } },
      { sort: { wastepicker_id: -1 } }
    );
    
    if (!lastWorker || !lastWorker.wastepicker_id) {
      return "WP001"; // Start with WP001 if no workers exist
    }
    
    // Extract number from wastepicker_id (e.g., "WP001" -> 1)
    const lastIdMatch = lastWorker.wastepicker_id.match(/WP(\d+)/);
    if (!lastIdMatch) {
      return "WP001"; // Fallback if format is unexpected
    }
    
    const lastNumber = parseInt(lastIdMatch[1]);
    const nextNumber = lastNumber + 1;
    
    // Format with leading zeros (WP001, WP002, etc.)
    return `WP${nextNumber.toString().padStart(3, '0')}`;
    
  } catch (error) {
    console.error('Error generating wastepicker_id:', error);
    return "WP001"; // Fallback
  }
}

export async function POST(request: Request) {
  try {
    // Connect to MongoDB
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    const body = await request.json();
    
    // Extract user data from request body
    const { 
      full_name, 
      CPF, 
      email, 
      phone, 
      PIS, 
      RG, 
      user_type, 
      password 
    } = body;
    
    // Validate required fields
    if (!full_name || !CPF || !password) {
      return NextResponse.json(
        { message: 'Campos obrigatórios não preenchidos' }, 
        { status: 400 }
      );
    }
    
    // Validate user_type
    const userTypeNumber = Number(user_type);
    if (userTypeNumber !== 0 && userTypeNumber !== 1) {
      return NextResponse.json(
        { message: 'Tipo de usuário inválido' }, 
        { status: 400 }
      );
    }
    
    // Check if user with this CPF already exists
    const existingUser = await db.collection('users').findOne({ 
      $or: [
        { CPF: CPF },
        { cpf: CPF }
      ] 
    });
    
    if (existingUser) {
      return NextResponse.json(
        { message: 'Já existe um usuário com este CPF' }, 
        { status: 409 }
      );
    }
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Create user document
    const newUser: any = {
      full_name,
      CPF,
      email,
      phone,
      PIS,
      RG,
      user_type: userTypeNumber,
      password: hashedPassword,
      created_at: new Date()
    };
    
    // Generate wastepicker_id for workers (user_type = 1)
    if (userTypeNumber === 1) {
      const wastepickerId = await generateWastepickerId(db);
      newUser.wastepicker_id = wastepickerId;
      console.log(`Assigning wastepicker_id: ${wastepickerId} to new worker: ${full_name}`);
    }
    
    // Insert user into database
    const result = await db.collection('users').insertOne(newUser);
    
    if (!result.acknowledged) {
      throw new Error('Falha ao criar usuário');
    }
    
    // Return success response without password
    const { password: _, ...userWithoutPassword } = newUser;
    
    const successMessage = userTypeNumber === 1 
      ? `Catador criado com sucesso! ID: ${newUser.wastepicker_id}`
      : 'Usuário de gerência criado com sucesso!';
    
    return NextResponse.json({
      message: successMessage,
      user: {
        ...userWithoutPassword,
        id: result.insertedId.toString()
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { message: 'Erro ao criar usuário' }, 
      { status: 500 }
    );
  }
} 