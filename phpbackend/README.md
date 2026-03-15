# ConfigFlow PHP Backend

Full-featured PHP 7.4 backend with MySQL for the ConfigFlow STB Configuration Editor.

## Requirements
- PHP >= 7.4
- MySQL 5.7+ or MariaDB 10.3+
- Composer

## Setup

```bash
cd phpbackend
composer install
cp .env.example .env
# Edit .env with your MySQL credentials
php bin/migrate.php
php bin/seed.php
composer start
```

API runs on `http://localhost:8080`

## Features
- **Authentication**: JWT-based with refresh tokens, device fingerprinting
- **Parser**: C/C++ preprocessor define parser with full relationship mapping
- **Projects**: Project → STB Model → Build hierarchy
- **Configurations**: Node/edge storage with snapshots
- **Audit**: Full audit logging
- **Users**: Role-based access control

## API Endpoints

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET  /api/auth/me`

### Parser
- `POST /api/parser/seed`
- `GET  /api/parser/sessions`
- `GET  /api/parser/sessions/{id}`
- `DELETE /api/parser/sessions/{id}`
- `GET  /api/parser/sessions/{id}/export?sheet=defineVars`

### Projects
- `GET/POST /api/projects`
- `GET/PUT/DELETE /api/projects/{id}`
- `POST /api/projects/{id}/stb-models`
- `POST /api/projects/stb-models/{id}/builds`

### Configurations
- `GET/POST /api/configurations`
- `GET/PUT/DELETE /api/configurations/{id}`

### Users
- `GET /api/users`
- `PATCH /api/users/{id}`

### Audit
- `GET /api/audit`
- `GET /api/audit/dashboard`

### Health
- `GET /api/health`
