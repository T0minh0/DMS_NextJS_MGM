import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';

// JWT secret key - in production this should be stored in environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'dms-dashboard-secret-key';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { cpf, password } = body;
    
    // Basic validation
    if (!cpf || !password) {
      return NextResponse.json(
        { message: 'CPF e senha são obrigatórios' },
        { status: 400 }
      );
    }
    
    // Try to find user in database
    let userData = null;
    try {
      const client = await clientPromise;
      const db = getDbFromClient(client);
      
      // Try different query patterns
      const queryPatterns = [
        { cpf: cpf.replace(/\D/g, '') },
        { CPF: cpf.replace(/\D/g, '') },
        { cpf: cpf },
        { CPF: cpf }
      ];
      
      for (const query of queryPatterns) {
        try {
          const user = await db.collection('users').findOne(query);
          
          if (user) {
            console.log('User found in database:', user);
            
            // Extract name from different possible fields
            const possibleNameFields = ['full_name', 'name', 'fullName', 'fullname', 'username'];
            const foundName = possibleNameFields.find(field => user[field]);
            
            userData = {
              ...user,
              full_name: foundName ? user[foundName] : (user.full_name || "Carlos Ferreira")
            };
            
            break;
          }
        } catch (err) {
          console.error('Error querying users:', err);
        }
      }
      
      if (!userData) {
        console.log('User not found in database');
      }
    } catch (error) {
      console.error('Database error:', error);
    }
    
    // Fallback to mock user if not found
    const finalUser = userData || {
      _id: "67fe65f101ef7b5bde6e19c7",
      full_name: "Erro ao buscar usuário",
      cpf: "56789012345",
      user_type: 0
    };
    
    // Create JWT token
    const token = jwt.sign(
      { 
        id: finalUser._id,
        name: finalUser.full_name,
        cpf: finalUser.cpf,
        userType: finalUser.user_type
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    // Store in cookies
    cookies().set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 8, // 8 hours
      sameSite: 'strict'
    });
    
    // Return success response with user data
    return NextResponse.json({
      message: 'Login realizado com sucesso',
      user: {
        id: finalUser._id,
        name: finalUser.full_name,
        full_name: finalUser.full_name,
        userType: finalUser.user_type,
        notFound: userData === null // Add a flag for frontend to know if user was found
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { message: 'Erro no servidor' },
      { status: 500 }
    );
  }
} 