// generate-password.js

// Replace 'new-password' with the actual password you want to set
const password = '123456';
const saltRounds = 12;

void import('bcryptjs').then((bcryptModule) => {
  const bcrypt = bcryptModule.default ?? bcryptModule;
  const hashedPassword = bcrypt.hashSync(password, saltRounds);

  console.log('Password:', password);
  console.log('Hashed Password:', hashedPassword);
});
