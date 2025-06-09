import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

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
            // Log only non-sensitive information
            console.log('User found in database with ID:', user._id);
            
            // Check if user is a manager (user_type 0)
            if (user.user_type !== 0) {
              console.log('User is not a manager. Access denied.');
              return NextResponse.json(
                { message: 'Acesso restrito apenas para gerentes' },
                { status: 403 }
              );
            }
            
            // Extract name from different possible fields
            const possibleNameFields = ['full_name', 'name', 'fullName', 'fullname', 'username'];
            const foundName = possibleNameFields.find(field => user[field]);
            
            userData = {
              ...user,
              full_name: foundName ? user[foundName] : (user.full_name || "User")
            };
            
            break;
          }
        } catch (err) {
          console.error('Error querying users:', err);
        }
      }
      
      if (!userData) {
        console.log('User not found in database');
        return NextResponse.json(
          { message: 'Usuário não encontrado' },
          { status: 401 }
        );
      }
    } catch (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { message: 'Erro ao acessar o banco de dados' },
        { status: 500 }
      );
    }
    
    // Verify password
    let passwordIsValid = false;
    
    // If we have a hashed password in the database
    if (userData.password_hash) {
      passwordIsValid = await bcrypt.compare(password, userData.password_hash);
    } 
    // If we have a password field that starts with $2a$ or $2b$ (bcrypt hash format)
    else if (userData.password && (userData.password.startsWith('$2a$') || userData.password.startsWith('$2b$'))) {
      // It's a bcrypt hash, use compare
      passwordIsValid = await bcrypt.compare(password, userData.password);
    }
    // If we have a plain text password in the database (legacy case)
    else if (userData.password) {
      passwordIsValid = password === userData.password;
    }
    
    // If password is invalid
    if (!passwordIsValid) {
      return NextResponse.json(
        { message: 'Senha incorreta' },
        { status: 401 }
      );
    }
    
    // Password is valid, create JWT token
    const token = jwt.sign(
      { 
        id: userData._id,
        name: userData.full_name,
        cpf: userData.cpf,
        userType: userData.user_type
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
        id: userData._id,
        name: userData.full_name,
        full_name: userData.full_name,
        userType: userData.user_type
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