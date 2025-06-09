# Project Documentation

This document provides a comprehensive overview of the "DMS Dashboard" project, a web application designed for managing and visualizing data related to waste material collection, stock, sales, and worker performance. It serves as a central hub for understanding the project's architecture, setup, API endpoints, data structures, and frontend components.

## Table of Contents

- [Introduction](#introduction)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Install Dependencies](#2-install-dependencies)
  - [3. Configure Environment Variables](#3-configure-environment-variables)
  - [4. Database Setup (If applicable)](#4-database-setup-if-applicable)
  - [5. Run the Development Server](#5-run-the-development-server)
  - [6. Building for Production](#6-building-for-production)
- [Project Structure](#project-structure)
  - [Password Generation Script (`generatepass.js`)](#password-generation-script-generatepassjs)
- [API Endpoints](#api-endpoints)
  - [Authentication](#authentication)
  - [Birthdays](#birthdays)
  - [Cooperatives](#cooperatives)
  - [Debug Endpoints](#debug-endpoints)
  - [Data Utilities](#data-utilities)
  - [Earnings Comparison](#earnings-comparison)
  - [Materials](#materials)
  - [Price Fluctuation](#price-fluctuation)
  - [Sales](#sales)
  - [Stock](#stock)
  - [User](#user)
  - [Users](#users)
  - [Worker Collections](#worker-collections)
  - [Worker Productivity](#worker-productivity)
- [Data Models](#data-models)
  - [Defined Mongoose Models](#defined-mongoose-models)
  - [Other Important Collections (Inferred from API Routes)](#other-important-collections-inferred-from-api-routes)
  - [Important Note on Data Model Usage](#important-note-on-data-model-usage)
- [Frontend Components](#frontend-components)
  - [Main Layout (`src/app/layout.tsx`)](#main-layout-srcapplayouttsx)
  - [Application Layout (`src/components/Layout.tsx`)](#application-layout-srccomponentslayouttsx)
  - [Dashboard Page (`src/app/page.tsx`)](#dashboard-page-srcapppagetsx)
  - [Other Notable Components (Inferred)](#other-notable-components-inferred)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)
- [Learn More (from original README.md)](#learn-more-from-original-readmemd)

## Introduction

The DMS Dashboard is a Next.js web application built with TypeScript, React, and Tailwind CSS, utilizing a MongoDB database via Mongoose. It provides a user interface for tracking and analyzing waste management data, including material stock, sales, worker collections, and price trends. Key features include user authentication, data visualization through charts, and various API endpoints for data retrieval and management.

## Getting Started

This section explains how to set up and run the project locally.

### Prerequisites

- Node.js (version recommended by Next.js, e.g., 18.x or later)
- npm, yarn, pnpm, or bun (package manager)
- Access to a MongoDB instance (local or cloud-hosted)
- Git (for cloning the repository)

### 1. Clone the Repository

If you haven't already, clone the project repository to your local machine:

```bash
git clone <repository_url> # Replace <repository_url> with the actual URL
cd <project_directory>   # Replace <project_directory> with the folder name
```

### 2. Install Dependencies

Install the project dependencies using your preferred package manager:

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

### 3. Configure Environment Variables

The application requires a MongoDB connection URI and a JWT secret for authentication. Create a `.env.local` file in the root of the project and add the following:

```env
MONGODB_URI="your_mongodb_connection_string"
MONGODB_DB="your_database_name" # Optional: defaults to 'DMS' if not set. Used by src/models/index.ts.
JWT_SECRET="your_strong_jwt_secret_key" # Crucial for security. Used by /api/auth/login.
```

- Replace `your_mongodb_connection_string` with the actual URI for your MongoDB database (e.g., `mongodb://localhost:27017/dms_dashboard` or a cloud provider string).
- Replace `your_database_name` with the name of your database if it's different from `DMS`.
- Replace `your_strong_jwt_secret_key` with a long, random, and secret string for signing JSON Web Tokens (JWTs). **The default value 'dms-dashboard-secret-key' found in the code is insecure and must not be used in production.**

**Note**:
- `src/lib/mongodb.ts` primarily uses `MONGODB_URI` to establish a database connection.
- `src/models/index.ts` uses `MONGODB_DB` to specify the database name.
- The login API route (`src/app/api/auth/login/route.ts`) uses `JWT_SECRET` for token generation.

### 4. Database Setup (If applicable)

- Ensure your MongoDB instance is running and accessible with the credentials provided in `MONGODB_URI`.
- The application interacts with several collections (e.g., `users`, `materials`, `measurements`, `sales`). If starting with an empty database:
    - The application may attempt to create collections as new data is added if Mongoose models are used for insertion.
    - However, for full functionality and to avoid relying on sample data fallbacks in API routes, you might need to manually populate essential data for collections such as `users` and `materials`.
    - **Regarding Database Seeding**: Code comments in some parts of the application mention a Python script named `repopulate_db.py` for database seeding. However, this script is **not provided** in the current project repository.
    - Therefore, developers starting with an empty database should:
        - Be prepared to create initial user accounts (e.g., an admin user). The `generatepass.js` script can be used to create password hashes for manual insertion into the `users` collection.
        - Add some initial materials to the `materials` collection.
        - Other collections like `measurements` and `sales` will be populated as data is generated through application usage.
- Without initial or correctly structured data (especially for `users` and `materials`), some dashboard features might have limited functionality or might default to sample data as coded in some API endpoints.

### 5. Run the Development Server

Start the Next.js development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

This will typically start the application on `http://localhost:3000`. Open this URL in your browser. The page auto-updates as you edit files.

### 6. Building for Production

To create an optimized production build:

```bash
npm run build
# or
yarn build
# or
pnpm build
# or
bun build
```

After building, you can start the production server:

```bash
npm run start
# or
yarn start
# or
pnpm start
# or
bun start
```

## Project Structure

The project follows a standard Next.js project structure using the App Router:

- **`src/app`**: Contains the core application code, including pages, layouts, and API routes.
  - **`src/app/api`**: Houses all backend API route handlers (Route Handlers).
  - **`src/app/login`**: Contains the login page UI and related components.
  - **`src/app/page.tsx`**: The main dashboard page component of the application.
  - **`src/app/layout.tsx`**: The root layout component for the application.
- **`src/components`**: Contains reusable React components used across different parts of the application.
  - **`src/components/Layout.tsx`**: The layout component (sidebar, header) for authenticated sections of the application.
- **`src/lib`**: Contains utility functions and library configurations.
  - **`src/lib/mongodb.ts`**: Handles the connection to the MongoDB database.
- **`src/models`**: Defines Mongoose schemas and models for interacting with the database.
  - **`src/models/index.ts`**: Exports all defined models and provides a database connection function.
- **`public`**: Contains static assets like images, SVGs, and fonts that are served directly.
- **`pages`**: (Note: This project primarily uses the `app` directory for routing. While Next.js supports the `pages` directory for routing, this project does not currently have one. If added, files here would also become routes.)

Key configuration files at the root:

- **`next.config.ts`**: Configuration file for Next.js features and build process.
- **`tailwind.config.ts`**: Configuration file for Tailwind CSS utility classes and theming.
- **`tsconfig.json`**: Configuration file for the TypeScript compiler.
- **`package.json`**: Lists project dependencies, scripts (like `dev`, `build`, `start`), and project metadata.
- **`generatepass.js`**: A standalone Node.js script for generating bcrypt password hashes. See the ["Password Generation Script (`generatepass.js`)"](#password-generation-script-generatepassjs) subsection under "Project Structure" for full details.
- **`eslint.config.mjs`**: Configuration for ESLint, a static code analysis tool for identifying problematic patterns in JavaScript/TypeScript code.
- **`postcss.config.mjs`**: Configuration for PostCSS, a tool for transforming CSS with JavaScript plugins.

### Password Generation Script (`generatepass.js`)

-   **Purpose**: The `generatepass.js` script is a utility for generating password hashes using `bcrypt`. This is necessary because passwords should be stored in a hashed format for security, rather than as plain text.
-   **How to Use**:
    1.  **Modify Script**: Open `generatepass.js` in a text editor. Locate the `password` variable (which defaults to `'123456'`) and change its value to the desired plain-text password you want to hash.
        ```javascript
        // Inside generatepass.js
        const password = 'your-desired-password-here';
        // ... rest of the script
        ```
    2.  **Run from Command Line**: Execute the script using Node.js:
        ```bash
        node generatepass.js
        ```
    3.  **Output**: The script will print the original plain-text password and the generated bcrypt hash to the console.
        ```
        Plaintext password: your-desired-password-here
        Hashed password: $2b$10$.....................................................
        ```
-   **Typical Use Cases**:
    -   **Initial User Setup**: When creating the first admin user or other initial users directly in the database.
    -   **Test Accounts**: For creating test user accounts with known passwords for development and testing purposes.
    -   **Manual Database Entries**: If you need to manually insert a user into the database and require a correctly hashed password.
-   **Security Note**:
    -   Always change the default password (`'123456'`) in the script to your desired password before running it.
    -   This script is a development utility. It is not part of the production application's runtime and should not be deployed or made accessible in a production environment. Ensure it is used in a secure, local development context.

## API Endpoints

This section details the available API endpoints, their functionalities, and expected request/response formats. All endpoints are located under `/api`.

### Authentication

- **`POST /api/auth/login`**
  - **Description**: Authenticates a user based on CPF and password.
  - **Request Body**:
    ```json
    {
      "cpf": "user_cpf",
      "password": "user_password"
    }
    ```
  - **Response**:
    - **Success (200)**: Sets an `auth_token` (JWT) cookie and returns user details.
      ```json
      {
        "message": "Login realizado com sucesso",
        "user": {
          "id": "user_id",
          "name": "User Name",
          "full_name": "User Full Name",
          "userType": 0, // Or other user type integer
          "notFound": false // True if user was not found in DB and a fallback/sample was used
        }
      }
      ```
    - **Error (400)**: If `cpf` or `password` are not provided.
      ```json
      { "message": "CPF e senha são obrigatórios" }
      ```
    - **Error (500)**: Server-side error during login.
      ```json
      { "message": "Erro no servidor" }
      ```

- **`POST /api/auth/logout`**
  - **Description**: Logs out the current user by clearing the `auth_token` cookie.
  - **Response**:
    - **Success (200)**:
      ```json
      { "message": "Logout realizado com sucesso" }
      ```
    - **Error (500)**: Server-side error during logout.
      ```json
      { "message": "Erro no servidor" }
      ```

### Birthdays

- **`GET /api/birthdays`**
  - **Description**: Fetches users (specifically workers, identified by `user_type: 1`) whose birthdays occur in the current month.
  - **Query Parameters**: None.
  - **Response**:
    - **Success (200)**: An array of birthday objects. Returns sample data if no matching birthdays are found in the database for the current month.
      ```json
      [
        { "name": "User Full Name", "date": "DD/MM" },
        // ... more users
      ]
      ```
      Example Sample Data (if no DB entries for current month):
      ```json
      [
        { "name": "João Silva", "date": "15/06" },
        // ...
      ]
      ```
    - **Error (500)**: Server-side error.
      ```json
      { "error": "Failed to fetch birthdays data", "details": "Error message string" }
      ```

### Cooperatives

- **`GET /api/cooperatives`**
  - **Description**: Fetches a list of cooperatives.
  - **Query Parameters**: To be determined by code review.
  - **Response**:
    - **Success (200)**: Array of cooperative objects.
    - **Error Responses**: (500) Server Error.
  - **Note**: Methods (GET, POST) inferred from route file presence. Actual implementation details need code review.

- **`POST /api/cooperatives`**
  - **Description**: Creates a new cooperative.
  - **Request Body**: Cooperative data. (To be determined by code review).
  - **Response**:
    - **Success (201)**: Cooperative object created.
    - **Error Responses**: (400) Bad Request, (500) Server Error.
  - **Note**: Methods (GET, POST) inferred from route file presence. Actual implementation details need code review.

### Debug Endpoints

These endpoints appear to be for development and debugging purposes.

- **`GET /api/debug/collections`**
  - **Description**: Lists all collections in the connected MongoDB database and provides a sample document from each.
  - **Response (200)**:
    ```json
    {
      "collections": ["collection_name_1", "collection_name_2", "..."],
      "samples": {
        "collection_name_1": {
          "fields": ["field1", "field2", "..."],
          "sample": { "field1": "value1", "..." }
        },
        // ... more collections
      }
    }
    ```
  - **Error (500)**: Server-side error.

- **`GET /api/debug/check-data`**
  - **Description**: Checks some data consistency or status in the database.
  - **Query Parameters**: To be determined by code review.
  - **Response**:
    - **Success (200)**: Status message or data check results.
    - **Error Responses**: (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`POST /api/debug/create-test-user`**
  - **Description**: Creates a test user in the system.
  - **Request Body**: Test user data (To be determined by code review).
  - **Response**:
    - **Success (201)**: Created test user object.
    - **Error Responses**: (400) Bad Request, (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`GET /api/debug/wastepickers`**
  - **Description**: Attempts to find a specific wastepicker (user) using various query methods (by `wastepicker_id`, CPF, ObjectId). It may also attempt to insert a test user if not found.
  - **Response (200)**: An object containing results of different find/insert attempts.
    ```json
    {
      "byWastepickerId": { /* user doc */ } // or null
      "byCpf": { /* user doc */ } // or null
      "byObjectId": { /* user doc */ } // or null
      "collections": ["users", "..."], // list of collections
      "insertAttempt": { /* MongoDB update result */ }
      "afterInsert": { /* User document after upsert */ }
    }
    ```
  - **Error (500)**: Server-side error.

### Data Utilities

- **`POST /api/recalculate-contributions`**
  - **Description**: Triggers a recalculation of contributions or similar aggregate data.
  - **Request Body**: Potentially parameters for recalculation (To be determined by code review).
  - **Response**:
    - **Success (200)**: Message confirming recalculation started or completed.
    - **Error Responses**: (400) Bad Request, (500) Server Error.
  - **Note**: Actual implementation details need code review.

### Earnings Comparison

- **`GET /api/earnings-comparison`**
  - **Description**: Fetches aggregated earnings data from the `sales` collection for comparison over different time periods.
  - **Query Parameters**:
    - `material_id` (optional `String`): ID of the material to filter earnings by.
    - `period_type` (optional `String`): `weekly`, `monthly` (default), or `yearly`. Defines the aggregation period.
  - **Response**:
    - **Success (200)**: An array of earnings data points.
      ```json
      [
        { "period": "Period Label", "earnings": 1234.56 },
        // ... more periods (typically 6 for monthly/weekly, variable for yearly)
      ]
      ```
      Period Label format examples:
        - Weekly: "DD/MM - DD/MM"
        - Monthly: "jun", "jul" (abbreviated month name)
        - Yearly: "YYYY"
    - **No Data (200)**: If no sales data is found for the criteria.
      ```json
      {
        "noData": true,
        "message": "Não há vendas registradas para este material" // or general message
      }
      ```
    - **Error (500)**: Server-side error.
      ```json
      {
        "noData": true, // Often returns noData structure on error too
        "message": "Erro ao buscar dados de vendas. Por favor, tente novamente mais tarde."
      }
      ```

### Materials

- **`GET /api/materials`**
  - **Description**: Fetches a list of all materials from the `materials` collection.
  - **Query Parameters**: None.
  - **Response**:
    - **Success (200)**: An array of material objects.
      ```json
      [
        {
          "_id": "material_object_id", // MongoDB ObjectId
          "material_id": "material_id_value", // Application-specific ID, or _id if material_id is missing
          "name": "Material Name", // Preferred name, or derived from material.material
          // ... other fields from the material document in the collection
        },
        // ... more materials
      ]
      ```
    - **Error (404)**: If no materials are found in the database.
      ```json
      { "error": "No materials available", "details": "No materials were found in the database" }
      ```
    - **Error (500)**: Server-side error.
      ```json
      { "error": "Failed to fetch materials", "details": "Error message string" }
      ```

- **`POST /api/materials`**
  - **Description**: Creates a new material.
  - **Request Body**: Material data (To be determined by code review).
  - **Response**:
    - **Success (201)**: Material object created.
    - **Error Responses**: (400) Bad Request, (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`GET /api/materials/{id}`**
  - **Description**: Fetches a specific material by its ID.
  - **Path Parameters**:
    - `id`: The ID of the material.
  - **Query Parameters**: None.
  - **Response**:
    - **Success (200)**: Material object.
    - **Error Responses**: (404) Not Found, (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`PUT /api/materials/{id}`**
  - **Description**: Updates a specific material by its ID.
  - **Path Parameters**:
    - `id`: The ID of the material to update.
  - **Request Body**: Updated material data (To be determined by code review).
  - **Response**:
    - **Success (200)**: Updated material object.
    - **Error Responses**: (400) Bad Request, (404) Not Found, (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`DELETE /api/materials/{id}`**
  - **Description**: Deletes a specific material by its ID.
  - **Path Parameters**:
    - `id`: The ID of the material to delete.
  - **Response**:
    - **Success (200)**: Message confirming deletion.
    - **Error Responses**: (404) Not Found, (500) Server Error.
  - **Note**: Actual implementation details need code review.

### Price Fluctuation

- **`GET /api/price-fluctuation`**
  - **Description**: Fetches price fluctuation data for materials, sourced from the `sales` collection.
  - **Query Parameters**:
    - `material_id` (optional `String`): ID of the specific material to fetch price history for.
  - **Response**:
    - **Success (200, with `material_id`)**: An array of the last 10 sales records for the specified material, sorted chronologically.
      ```json
      [
        {
          "date": "ISO_date_string", // e.g., "2023-06-15T00:00:00.000Z"
          "material": "Material Name",
          "price": 12.34, // price/kg
          "dateLabel": "DD Mmm YY", // e.g., "15 Jun 23"
          "timestamp": 1678886400000 // Unix timestamp milliseconds
        },
        // ... up to 10 records
      ]
      ```
    - **Success (200, without `material_id`)**: Data for the top 5 materials with the most recent sales. For each of these, the last 10 sales records are aggregated by date.
      ```json
      {
        "materials": ["Material Name 1", "Material Name 2", "..."], // Top 5 material names
        "priceData": [
          {
            "weekLabel": "DD Mmm YY", // Unique date label across all sales
            "date": "ISO_date_string",
            "materials": {
              "Material Name 1": 10.50, // Price if available for this date
              "Material Name 2": 12.75,
              // ... other materials might be null if no sale on this date
            }
          },
          // ... more date points
        ]
      }
      ```
    - **No Data (200)**: If no relevant sales data is found for the criteria.
      ```json
      {
        "noData": true,
        "message": "Não há histórico de preços para este material" // or general message
      }
      ```
    - **Error (Returns 200 with `noData:true`)**: If an error occurs during fetching, it often returns a 200 status with a `noData` structure.
      ```json
      {
        "noData": true,
        "message": "Erro ao buscar dados de preços"
      }
      ```

### Sales

- **`GET /api/sales`**
  - **Description**: Fetches a list of sales records.
  - **Query Parameters**: To be determined by code review (e.g., filters for material, date range).
  - **Response**:
    - **Success (200)**: Array of sales objects.
    - **Error Responses**: (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`POST /api/sales`**
  - **Description**: Creates a new sales record.
  - **Request Body**: Sales data (To be determined by code review).
  - **Response**:
    - **Success (201)**: Sales object created.
    - **Error Responses**: (400) Bad Request, (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`GET /api/sales/{id}`**
  - **Description**: Fetches a specific sales record by its ID.
  - **Path Parameters**:
    - `id`: The ID of the sales record.
  - **Query Parameters**: None.
  - **Response**:
    - **Success (200)**: Sales object.
    - **Error Responses**: (404) Not Found, (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`PUT /api/sales/{id}`**
  - **Description**: Updates a specific sales record by its ID.
  - **Path Parameters**:
    - `id`: The ID of the sales record to update.
  - **Request Body**: Updated sales data (To be determined by code review).
  - **Response**:
    - **Success (200)**: Updated sales object.
    - **Error Responses**: (400) Bad Request, (404) Not Found, (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`DELETE /api/sales/{id}`**
  - **Description**: Deletes a specific sales record by its ID.
  - **Path Parameters**:
    - `id`: The ID of the sales record to delete.
  - **Response**:
    - **Success (200)**: Message confirming deletion.
    - **Error Responses**: (404) Not Found, (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`GET /api/sales/buyers`**
  - **Description**: Fetches a list of unique buyers from sales records.
  - **Query Parameters**: To be determined by code review.
  - **Response**:
    - **Success (200)**: Array of buyer names or objects.
    - **Error Responses**: (500) Server Error.
  - **Note**: Actual implementation details need code review.

### Stock

- **`GET /api/stock`**
  - **Description**: Fetches current stock data. It aggregates weights from the `measurements` collection and subtracts sold quantities from the `sales` collection.
  - **Query Parameters**:
    - `material_id` (optional `String`): ID of the material to filter stock for.
  - **Response**:
    - **Success (200)**: An object where keys are material names and values are their current stock weight in kg. Returns sample data if no stock data is found in the DB.
      ```json
      {
        "Material Name 1": 150.75,
        "Material Name 2": 200.00,
        // ... more materials
      }
      ```
    - **No Data (200, for specific `material_id`)**: If `material_id` is provided but no stock is found for it.
      ```json
      { "noData": true, "message": "Não há estoque deste material" }
      ```
    - **Sample Data (if DB is empty or error occurs)**:
      ```json
      {
        "Papelão": 950,
        "Papel Branco": 850,
        // ... more sample materials
      }
      ```
    - **Error**: In case of a server error, it often falls back to returning sample stock data with a 200 status.

### User

- **`GET /api/user`**
  - **Description**: Fetches details for a specific user.
  - **Query Parameters**:
    - `id` (required `String`): The MongoDB ObjectId or application-specific ID of the user to fetch.
  - **Response**:
    - **Success (200)**: User object (sensitive fields like password hash are omitted).
      ```json
      {
        "_id": "user_mongodb_object_id",
        "full_name": "User Full Name",
        // ... other user fields
      }
      ```
    - **Error (400)**: If `id` query parameter is not provided.
      ```json
      { "message": "User ID is required" }
      ```
    - **Error (404)**: If user with the given ID is not found.
      ```json
      { "message": "User not found" }
      ```
    - **Error (500)**: Server-side error.
      ```json
      { "message": "Error fetching user data" }
      ```

- **`POST /api/user/change-password`**
  - **Description**: Allows an authenticated user to change their password.
  - **Request Body**:
    ```json
    {
      "currentPassword": "current_user_password",
      "newPassword": "new_user_password"
    }
    ```
    (Details to be confirmed by code review)
  - **Response**:
    - **Success (200)**: Message confirming password change.
    - **Error Responses**: (400) Bad Request (e.g., incorrect current password, weak new password), (401) Unauthorized, (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`PUT /api/user/update`**
  - **Description**: Allows an authenticated user to update their own profile information.
  - **Request Body**: User data to update (e.g., email, phone; To be determined by code review).
  - **Response**:
    - **Success (200)**: Updated user object.
    - **Error Responses**: (400) Bad Request, (401) Unauthorized, (500) Server Error.
  - **Note**: Actual implementation details need code review.

### Users

- **`GET /api/users`**
  - **Description**: Fetches a list of "wastepickers" (workers, identified by `user_type: 1`).
  - **Query Parameters**: None.
  - **Response**:
    - **Success (200)**: An array of user objects (sensitive fields omitted). Returns sample data if no workers are found in the DB.
      ```json
      [
        {
          "wastepicker_id": "WP001", // Application-specific worker ID
          "full_name": "Worker Full Name",
          "user_type": 1,
          // ... other user fields
        },
        // ... more users
      ]
      ```
      Sample Data (if no DB entries for workers):
      ```json
      [
        { "wastepicker_id": "WP001", "full_name": "João Silva", "user_type": 1, ... },
        // ...
      ]
      ```
    - **Error (500)**: Server-side error.
      ```json
      { "error": "Failed to fetch users", "details": "Error message string" }
      ```

- **`GET /api/users/all`**
  - **Description**: Fetches all users from the `users` collection, regardless of their `user_type`.
  - **Query Parameters**: None.
  - **Response**:
    - **Success (200)**: An array of all user objects (sensitive fields omitted).
      ```json
      [
        {
          "_id": "user_mongodb_object_id",
          "full_name": "User Full Name",
          // ... other user fields including user_type
        },
        // ... more users
      ]
      ```
    - **Error (500)**: Server-side error.
      ```json
      { "message": "Error fetching users data" }
      ```

- **`POST /api/users/create`**
  - **Description**: Creates a new user.
  - **Request Body**: User data for the new user (To be determined by code review).
  - **Response**:
    - **Success (201)**: Created user object.
    - **Error Responses**: (400) Bad Request, (500) Server Error.
  - **Note**: Actual implementation details need code review.

- **`PUT /api/users/update`**
  - **Description**: Updates an existing user's information. Likely requires user ID in the body or as a query parameter.
  - **Request Body**: User data to update, including ID of the user (To be determined by code review).
  - **Response**:
    - **Success (200)**: Updated user object.
    - **Error Responses**: (400) Bad Request, (404) Not Found, (500) Server Error.
  - **Note**: Actual implementation details need code review. The path does not include an ID, so ID must be in payload.

- **`DELETE /api/users/delete`**
  - **Description**: Deletes a user. Likely requires user ID in the body or as a query parameter.
  - **Request Body**: Object containing the ID of the user to delete, e.g. `{ "id": "user_id" }` (To be determined by code review).
  - **Response**:
    - **Success (200)**: Message confirming deletion.
    - **Error Responses**: (400) Bad Request, (404) Not Found, (500) Server Error.
  - **Note**: Actual implementation details need code review. The path does not include an ID, so ID must be in payload or query.

- **`POST /api/users/assign-wastepicker-ids`**
  - **Description**: Assigns `wastepicker_id` to users who are workers and do not have one.
  - **Request Body**: None expected, or potentially parameters for assignment batch. (To be determined by code review).
  - **Response**:
    - **Success (200)**: Report of assignments made.
    - **Error Responses**: (500) Server Error.
  - **Note**: Actual implementation details need code review.

### Worker Collections

- **`GET /api/worker-collections`**
  - **Description**: Fetches data about material collections by workers, primarily from the `measurements` collection.
  - **Query Parameters**:
    - `worker_id` (optional `String`): ID of the worker to filter collections for.
    - `material_id` (optional `String`): ID of the material to filter collections for.
    - `period_type` (optional `String`): `weekly`, `monthly` (default), or `yearly`. Defines the time period for aggregation.
  - **Response**:
    - **Success (200, `grouped: false`)**: Typically when `material_id` is specified or `period_type` is not 'yearly'. Returns top 10 workers by total weight collected for the criteria.
      ```json
      {
        "grouped": false,
        "data": [
          {
            "wastepicker_id": "WP001",
            "worker_name": "Worker Name",
            "totalWeight": 123.45 // in kg
          },
          // ... more workers
        ]
      }
      ```
    - **Success (200, `grouped: true`)**: Typically for `period_type: 'yearly'` without a `material_id` filter. Returns data structured for a stacked bar chart, showing material breakdown for top 10 workers.
      ```json
      {
        "grouped": true,
        "workers": [ // Top 10 workers by total weight
          {
            "wastepicker_id": "WP001",
            "worker_name": "Worker Name",
            "totalWeight": 500.50,
            "material_id_1": 100.20, // Weight for material_id_1 (actual material ID as key)
            "material_id_2": 200.30, // Weight for material_id_2
            // ... weights for other materials collected by this worker
          },
          // ... more workers
        ],
        "materials": [ // List of unique materials collected by these top workers
          { "id": "material_id_1", "name": "Material Name 1" },
          { "id": "material_id_2", "name": "Material Name 2" },
          // ... more materials
        ]
      }
      ```
    - **No Data (200)**: If no collection data is found for the given filters.
      ```json
      {
        "noData": true,
        "message": "Não há coletas deste material em este período" // or similar
      }
      ```
    - **Error (500, often returns `noData:true`)**: Server-side error.
      ```json
      {
        "noData": true,
        "message": "Erro ao buscar dados de coletas. Por favor, tente novamente mais tarde."
      }
      ```

### Worker Productivity

- **`GET /api/worker-productivity`**
  - **Description**: Fetches data related to worker productivity metrics.
  - **Query Parameters**: To be determined by code review (e.g., `worker_id`, `period_type`).
  - **Response**:
    - **Success (200)**: Productivity data for workers.
    - **Error Responses**: (500) Server Error.
  - **Note**: Actual implementation details need code review.

## Data Models

The application uses Mongoose to define schemas and interact with the MongoDB database. The primary Mongoose models are defined in `src/models/index.ts`. However, as noted below, some API endpoints derive data from collections not strictly governed by these explicit models or use different field names than defined in the schemas.

### Defined Mongoose Models

The following models have schemas defined in `src/models/index.ts`:

1.  **Material (`MaterialSchema`)**
    -   **Collection Name**: `materials` (as specified in the schema: `{ collection: 'materials' }`).
    -   **Description**: Represents a type of waste material.
    -   **Schema Fields**:
        -   `material_id`: `Number` (Required, Unique) - An application-specific identifier for the material.
        -   `material`: `String` (Required) - The name of the material (e.g., "Papelão", "Plástico PET"). This seems to be the primary name field in the schema.
        -   `name`: `String` - Not explicitly in the schema but often used in API responses (e.g., in `/api/materials`). This might be an alias for `material` or populated from a different field in the `materials` collection if it's distinct from `waste_type`.

2.  **User (`UserSchema`)**
    -   **Collection Name**: `users`
    -   **Description**: Represents users of the system, including administrators and workers (wastepickers).
    -   **Schema Fields**:
        -   **Important Note on Field Usage**: Developers should be aware that some API routes might expect or use field names not explicitly defined in this schema or with different casing/spacing. For instance, the login API (`/api/auth/login`) uses a `cpf` field which is not in the schema, and the birthdays API (`/api/birthdays`) refers to `"Birth date"` (with a space) which differs from the `birthdate` schema field. Always cross-verify with the specific API implementation.
        -   `wastepicker_id`: `Number` (Unique, Sparse) - Specific identifier for wastepickers.
        -   `user_id`: `Number` (Required, Unique) - General unique user identifier.
        -   `user_type`: `Number` (Required) - Type of user (e.g., `0` for admin, `1` for wastepicker/worker).
        -   `username`: `String` (Required, Unique) - Login username.
        -   `password_hash`: `String` - Hashed password for the user. (Login API expects `password` in request, implying hashing before storage or comparison with this field).
        -   `full_name`: `String` - Full name of the user.
        -   `email`: `String` - Email address.
        -   `phone`: `String` - Phone number.
        -   `birthdate`: `Date` - User's birthdate. (Note: As mentioned above, the `/api/birthdays` API specifically uses a field named `"Birth date"` (with a space) from the database for workers, which might be an alternative or legacy field name not matching this schema field directly).
        -   `active`: `Boolean` (Default: `true`) - Whether the user account is active.
        -   `created_at`: `Date` (Default: `Date.now`) - Timestamp of user creation.
    -   **Other Fields Observed in DB/APIs (potentially not in schema but used, illustrating the note above)**:
        -   `cpf`: `String` (Used in login API `/api/auth/login`).
        -   `coopeative_id`: `String` (Typo for `cooperative_id`?).
        -   `"Entry date"`: `Date` (Entry date of the worker).
        -   `PIS`: `String` (PIS number).
        -   `RG`: `String` (RG number).
        -   `gender`: `String`.

3.  **Stock (`StockSchema`)**
    -   **Collection Name**: `stock`
    -   **Description**: Intended to represent the current stock of a particular material.
    -   **Schema Fields**:
        -   `material_id`: `Number` (Required, Ref: `Material`) - Reference to the material.
        -   `weight`: `Number` (Required) - Weight of the material in stock.
        -   `date`: `Date` (Default: `Date.now`) - Date when the stock was recorded.
    -   **Note on Usage**: While the `StockSchema` exists and defines a `stock` collection, the primary API route for dashboard stock data (`/api/stock`) dynamically calculates current stock levels primarily from the `measurements` (for additions) and `sales` (for subtractions) collections.
        This `stock` collection and its Mongoose model might be intended for specific backend operations, historical data storage, manual data entry, or could be a legacy structure not fully utilized by the current dashboard's read APIs. Developers should verify its specific use case if they intend to interact directly with this collection.

4.  **Collection (`CollectionSchema`)**
    -   **Collection Name**: `collections`
    -   **Description**: Intended to represent a record of materials collected by a worker.
    -   **Schema Fields**:
        -   `wastepicker_id`: `Number` (Required, Ref: `User`) - Reference to the worker.
        -   `material_id`: `Number` (Required, Ref: `Material`) - Reference to the collected material.
        -   `weight`: `Number` (Required) - Weight of the material collected.
        -   `date`: `Date` (Default: `Date.now`) - Date of the collection.
    -   **Note on Usage**: While the `CollectionSchema` exists and defines a `collections` collection (intended for worker collections), the primary API route for dashboard worker collection data (`/api/worker-collections`) dynamically calculates this data primarily from the `measurements` collection.
        This `collections` collection and its Mongoose model might be intended for specific backend operations, historical data storage, manual data entry, or could be a legacy structure not fully utilized by the current dashboard's read APIs. Developers should verify its specific use case if they intend to interact directly with this collection.

5.  **Price (`PriceSchema`)**
    -   **Collection Name**: `prices`
    -   **Description**: Intended to represent the price of a material at a certain point in time.
    -   **Schema Fields**:
        -   `material_id`: `Number` (Required, Ref: `Material`) - Reference to the material.
        -   `price`: `Number` (Required) - Price of the material (likely per unit of weight, e.g., per kg).
        -   `date`: `Date` (Default: `Date.now`) - Date when the price was set.
    -   **Note on Usage**: While the `PriceSchema` exists and defines a `prices` collection, the primary API route for dashboard price fluctuation data (`/api/price-fluctuation`) dynamically calculates this data primarily from the `sales` collection (using fields like `price_kg`).
        This `prices` collection and its Mongoose model might be intended for specific backend operations, historical data storage (e.g., base prices, price lists), manual data entry, or could be a legacy structure not fully utilized by the current dashboard's read APIs. Developers should verify its specific use case if they intend to interact directly with this collection.

### Other Important Collections (Inferred from API Routes)

Several API routes heavily rely on collections that might not have explicit Mongoose schemas defined in `src/models/index.ts` or are used with more flexibility than the defined schemas suggest. These are crucial for the application's functionality:

-   **`measurements`**
    -   **Description**: Stores records of individual material measurements or collections by workers. This collection is central to calculating current stock (total input) and worker collection statistics.
    -   **Key Fields (inferred from API usage)**:
        -   `material_id`: String or Number (referencing a material, often the `_id` from the `materials` collection or an application-specific ID).
        -   `Weight`: Number (weight of material, typically in kg).
        -   `timestamp`: Date or Number (when the material was measured/collected).
        -   `wastepicker_id`: String or Number (e.g., `WP001`, referencing a user/worker).

-   **`sales`**
    -   **Description**: Stores records of material sales. This collection is used for calculating earnings, price fluctuations, and current stock (total output).
    -   **Key Fields (inferred from API usage)**:
        -   `material_id`: String or Number (referencing a material).
        -   `date`: Date or String (date of the sale).
        -   `price_kg`: Number (price per kg, sometimes seen as `price/kg` or `unit_price`).
        -   `weight_sold`: Number (quantity sold, typically in kg).
        -   `buyer`: String (name or ID of the buyer, if available).

### Important Note on Data Model Usage

A key takeaway for developers is that while Mongoose schemas are defined in `src/models/index.ts`, their application and usage can vary, especially concerning API data retrieval for the dashboard.

**1. API Data Sourcing vs. Defined Schemas:**
-   **`Stock`, `Collection`, `Price` Models**: As detailed in their respective notes, the Mongoose models `StockSchema`, `CollectionSchema`, and `PriceSchema` (defining `stock`, `collections`, and `prices` collections) are not the primary sources for the main dashboard API routes (`/api/stock`, `/api/worker-collections`, `/api/price-fluctuation`). These routes dynamically calculate data primarily from the `measurements` and `sales` collections. The `stock`, `collections`, and `prices` collections might be for other backend uses, historical data, manual entries, or are legacy.
-   **`Material` Model**: The `MaterialSchema` correctly defines its collection as `materials`.

**2. Field Name and Usage Variations:**
-   **User Model Example**: The `UserSchema` defines fields like `birthdate`. However, some APIs expect or use fields not explicitly in the schema (e.g., `cpf` for `/api/auth/login`) or use different naming conventions (e.g., `"Birth date"` with a space by `/api/birthdays`, as highlighted in the `User` model section).
-   Other similar variations might exist across different models and API routes.

**3. Implications for Development:**
-   The Mongoose models in `src/models/index.ts` might not always be the single source of truth for understanding data structures as used by all API endpoints, particularly read-heavy dashboard APIs.
-   Some models might represent a target schema, are used for specific write operations, or are partially legacy.
-   The application employs a dynamic approach for some data aggregation and retrieval, interacting directly with MongoDB collections.

**Recommendation:**
**Developers must always cross-verify data models, collection names, and field structures by inspecting the relevant API route implementations (`src/app/api/...`) and, if possible, the actual database contents.** This is crucial for understanding how data is fetched, processed, and returned. The descriptions for `measurements` and `sales` collections are based on their inferred usage in the current API routes.

## Frontend Components

The frontend is built using Next.js (App Router) and React with TypeScript. Tailwind CSS is used for styling, and `react-chartjs-2` for data visualization.

### Main Layout (`src/app/layout.tsx`)

-   **Description**: This is the root layout for the entire application. It establishes the basic HTML structure (`<html>`, `<body>`).
-   **Functionality**:
    -   Applies global styles from `globals.css`.
    -   Configures and applies the Geist Sans and Geist Mono fonts using `next/font`.
    -   Sets default metadata (title, description) for the application, which can be overridden by individual pages.
    -   Wraps `children` components, meaning all pages will inherit this structure.

### Application Layout (`src/components/Layout.tsx`)

-   **Description**: Provides the main navigational structure (sidebar and header) for authenticated sections of the application, such as the main dashboard.
-   **Functionality**:
    -   Displays a sidebar navigation menu with links to different sections (e.g., "Dashboard", "Trabalhadores", "Materiais").
    -   Highlights the currently active path in the sidebar.
    -   Includes a header, typically for user information or actions like logout.
    -   Manages user authentication state:
        -   Checks for an `auth_token` in `localStorage` on the client-side.
        -   Redirects to `/login` if the token is missing.
        -   Provides a `handleLogout` function to clear the token and redirect to the login page.
    -   Wraps the main content of the authenticated pages (`children`).

### Dashboard Page (`src/app/page.tsx`)

-   **Description**: The main dashboard page displayed after successful user login. It provides an overview of various metrics related to material collection, sales, stock, and worker activity.
-   **Functionality**:
    -   **User Authentication & Welcome**: Retrieves user data from `localStorage` and potentially fetches more details from `/api/user`. Displays a welcome message.
    -   **Data Fetching**: Asynchronously fetches data from multiple API endpoints:
        -   `/api/materials` (for material filter options, mapping IDs to names)
        -   `/api/users` (for worker filter options)
        -   `/api/stock` (for current stock levels)
        -   `/api/earnings-comparison` (for historical earnings)
        -   `/api/worker-collections` (for materials collected by workers)
        -   `/api/price-fluctuation` (for material price history)
        -   `/api/birthdays` (for upcoming worker birthdays)
        -   Manages loading states while data is being fetched.
    -   **Filtering**: Provides dropdown filters that affect the data displayed in charts:
        -   **Material Filter**: For Stock, Earnings, Worker Collections, Price Fluctuation charts.
        -   **Worker Filter**: For the Worker Collections chart.
        -   **Period Filter**: For Earnings and Worker Collections charts (Weekly, Monthly, Yearly).
    -   **Statistics Cards**: Displays key summary statistics with icons (e.g., total materials, total workers, total stock, current month's earnings).
    -   **Charts (using `react-chartjs-2`)**:
        -   **Estoque Atual (Current Stock)**: Doughnut chart showing stock quantities per material.
        -   **Ganhos (Earnings)**: Line chart showing earnings over the selected period.
        -   **Coletas de Trabalhadores (Worker Collections)**: Horizontal Bar chart (or Stacked Bar for yearly overview) showing worker collection performance.
        -   **Flutuação de Preços (Price Fluctuation)**: Line chart showing price trends for selected materials or top materials.
        -   Each chart handles "no data" scenarios appropriately.
    -   **Birthdays Section**: Lists workers having birthdays in the current month.
    -   **Helper Functions**: Includes utility functions like `formatCurrency` and `formatWeight`.
    -   **State Management**: Uses React hooks (`useState`, `useEffect`, `useMemo`) for managing component state, data fetching logic, and memoizing calculations.

### Other Notable Components (Inferred)

-   The structure of `src/app/page.tsx` suggests that it internally manages distinct UI sections that could be (or are implicitly) sub-components, such as:
    -   Filter control group.
    -   Individual statistic display cards.
    -   Container components for each chart.
    -   List items for birthdays.
    While these might be part of the main page file, they represent logical component blocks.

## Usage

Geared for the management users at the cooperative.

## Contributing
Antônio Guimarães - UnB

## Learn More (from original README.md)

For more information about the Next.js framework used in this project:
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
