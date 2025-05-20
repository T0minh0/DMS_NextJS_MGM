// generate-password.js
const bcrypt = require('bcryptjs');

// Replace 'new-password' with the actual password you want to set
const password = '123456';
const saltRounds = 12;

// Generate hash
const hashedPassword = bcrypt.hashSync(password, saltRounds);
console.log('Password:', password);
console.log('Hashed Password:', hashedPassword);