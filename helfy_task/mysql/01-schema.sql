CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100)  NOT NULL UNIQUE,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(255)  NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  token      VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  revoked    TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_user_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  INDEX idx_user_tokens_token (token)
) ENGINE=InnoDB;

-- Seed demo user: username "demo" / password "Password123!"
INSERT INTO users (username, email, password_hash)
VALUES ('demo', 'demo@example.com', '$2b$10$BL61brKIvNkGH3B9iQGuZeKKs62R9zvtCzNxUytasYTKBGVlNhh82')
ON DUPLICATE KEY UPDATE username = username;