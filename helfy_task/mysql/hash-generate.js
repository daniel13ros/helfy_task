// Use this script to generate a bcrypt hash for a password. 
// You can run it with Node.js to get the hash value, which you can then insert into your database for testing purposes.

const bcrypt = require("bcryptjs");

const password = "Password123!";

bcrypt.hash(password, 10)
  .then(hash => {
    console.log(hash);
  });