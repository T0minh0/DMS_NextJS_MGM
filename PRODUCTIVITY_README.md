# Worker Productivity System

## Overview

The Worker Productivity System provides detailed insights into individual worker contributions, with proper handling of bag measurements to avoid double counting and accurate stock calculations that account for sales. The system now automatically assigns unique wastepicker_ids to workers for proper tracking.

## Features

### 1. Individual Worker Productivity Page (`/worker-productivity`)
- Select individual workers to view their weekly contributions
- Analyze performance over different time periods (4-52 weeks)
- View detailed statistics including:
  - Total weight collected
  - Weekly averages
  - Best performing week
  - Material breakdown

### 2. Worker ID Management
- **Automatic Assignment**: New workers (user_type = 1) automatically receive unique wastepicker_ids
- **ID Format**: Sequential format WP001, WP002, WP003, etc.
- **Migration Support**: Existing workers without IDs can be updated via admin tools
- **Unique Tracking**: Each worker has a permanent ID for contribution tracking

### 3. Measurement Calculation Logic

The system implements intelligent calculation logic to handle the following scenarios:

#### Problem Statement
- Bags are weighed multiple times per day as they are being filled
- Only the final weight when a bag is marked as "filled" should count
- Multiple workers can contribute to the same material on different days
- Each worker is responsible for one bag per material per day
- Stock levels must account for materials that have been sold
- Workers need unique IDs for productivity tracking

#### Solution
The calculation logic implements the following rules:

1. **Worker Identification**: 
   - New workers automatically get wastepicker_id (WP001, WP002, etc.)
   - Existing workers can be updated via admin migration tool
   - Only workers (user_type = 1) receive wastepicker_ids

2. **Daily Bag Logic**: For each worker-material-day combination:
   - If a bag is marked as filled (`bag_filled = 'Y'` or `'S'`), use that weight as the final contribution
   - If no bag is marked as filled, use the highest weight measurement for that day
   - This prevents counting progressive weights multiple times

3. **Weekly Aggregation**: Sum daily contributions by week for reporting

4. **Stock Calculation**: Current Stock = Total Collected - Total Sold
   - Uses corrected worker contributions for total collected amounts
   - Subtracts all recorded sales to show accurate available stock
   - Prevents negative stock levels

5. **Automatic Storage**: Calculated contributions are stored in the `worker_contributions` collection

### 4. API Endpoints

#### `/api/worker-productivity`
- **Method**: GET
- **Parameters**:
  - `worker_id`: ID of the worker to analyze
  - `weeks`: Number of weeks to analyze (default: 12)
- **Returns**: Weekly contributions and statistics

#### `/api/recalculate-contributions`
- **Method**: POST
- **Purpose**: Recalculates all worker contributions from raw measurements
- **Access**: Admin only
- **Returns**: Summary statistics of the recalculation

#### `/api/users/create`
- **Method**: POST
- **Purpose**: Create new users with automatic wastepicker_id assignment
- **Features**: 
  - Automatically assigns wastepicker_id to workers (user_type = 1)
  - Sequential ID generation (WP001, WP002, etc.)
  - Management users (user_type = 0) don't receive wastepicker_id

#### `/api/users/assign-wastepicker-ids`
- **Method**: POST
- **Purpose**: Migration tool to assign IDs to existing workers
- **Access**: Admin only
- **Features**: 
  - Finds workers without wastepicker_id
  - Assigns sequential IDs avoiding duplicates
  - Bulk update operation

#### `/api/stock`
- **Method**: GET
- **Parameters**:
  - `material_id`: Optional filter for specific material
- **Returns**: Current stock levels (collected - sold) by material
- **Features**: 
  - Automatically detects sales collection structure
  - Handles various weight field names (weight_sold, weight, quantity, amount)
  - Shows only materials with available stock

#### `/api/sales`
- **Method**: GET, POST, PUT, DELETE
- **Purpose**: Manage sales records
- **GET Parameters**:
  - `material_id`: Filter by material
  - `start_date` / `end_date`: Date range filtering
  - `limit`: Maximum records to return
- **Features**: 
  - Stock validation before allowing sales
  - Automatic total value calculation
  - Sales history and summary statistics

### 5. Dashboard Integration

#### Main Dashboard Updates
- **Accurate Stock Display**: Shows current stock (collected - sold)
- **Sales Integration**: Stock calculations account for all recorded sales
- **Admin Tools**: Contribution recalculation and wastepicker_id assignment
- **Real-time Validation**: Prevents overselling available stock

#### Worker Management
- **Automatic ID Assignment**: New workers get IDs immediately upon creation
- **Migration Tools**: Admin can assign IDs to existing workers
- **User Type Distinction**: Only workers (catadores) receive wastepicker_ids

#### Productivity Page
- Interactive charts showing weekly trends
- Material-specific contribution tracking
- Detailed weekly breakdowns with measurement counts

### 6. Data Structure

#### Collections Used
- `measurements`: Raw weight measurements from devices
- `worker_contributions`: Calculated weekly contributions (auto-generated)
- `sales`: Sales records for stock deduction
- `users`: Worker information with wastepicker_id
- `materials`: Material definitions

#### Key Fields in users (for workers)
```javascript
{
  _id: ObjectId("..."),
  full_name: "João Silva",
  CPF: "12345678901",
  email: "joao@example.com",
  phone: "+5511999999999",
  user_type: 1, // 1 = Worker, 0 = Management
  wastepicker_id: "WP001", // Automatically assigned
  created_at: ISODate("2025-01-15T10:30:00.000Z")
}
```

#### Key Fields in worker_contributions
```javascript
{
  wastepicker_id: "WP001",
  material_id: "3",
  weight: 125.50,
  earnings: 313.75,
  period: {
    week: 42,
    year: 2025
  },
  daily_breakdown: [
    { date: "2025-01-15", weight: 65.25 },
    { date: "2025-01-16", weight: 60.25 }
  ],
  last_updated: ISODate("2025-01-15T14:57:09.109Z")
}
```

#### Key Fields in sales
```javascript
{
  material_id: "3",
  buyer_name: "Recycleway Corp",
  weight_sold: 150.00,
  price_per_kg: 2.80,
  total_value: 420.00,
  sale_date: "2025-01-20",
  created_by: "admin",
  created_at: ISODate("2025-01-20T10:30:00.000Z")
}
```

### 7. Stock Management

#### Accurate Stock Calculation
- **Formula**: Available Stock = Σ(Worker Contributions) - Σ(Sales)
- **Real-time Updates**: Stock reflects immediate impact of new contributions and sales
- **Validation**: System prevents selling more than available stock
- **Multi-field Support**: Handles various sales record formats automatically

#### Sales Integration
- **Pre-sale Validation**: Checks available stock before allowing sales
- **Automatic Calculations**: Total sale value computed from weight × price
- **Historical Tracking**: Complete sales history with material information
- **Summary Statistics**: Total sales volume, value, and average prices

### 8. Usage Instructions

#### For Administrators
1. **Initial Setup**: Run the recalculation process from the main dashboard
2. **Worker ID Migration**: Use "Atribuir IDs aos Catadores" to assign IDs to existing workers
3. **Stock Monitoring**: Review accurate stock levels that account for sales
4. **Sales Management**: Record sales to maintain accurate inventory
5. **Regular Maintenance**: Recalculate contributions periodically

#### For Worker Management
1. **Creating New Workers**: Workers automatically receive wastepicker_id upon creation
2. **Worker Type Selection**: Choose "Catador" for workers or "Gerência" for management
3. **Required Fields**: Full name, CPF, and password are mandatory
4. **ID Tracking**: Each worker gets a unique, permanent tracking ID

#### For Users
1. **View Stock**: Check current available materials on dashboard
2. **Individual Performance**: Navigate to "Produtividade" to analyze workers
3. **Sales Records**: Access sales history and statistics
4. **Trend Analysis**: Use charts to identify collection and sales patterns

### 9. Benefits

1. **Unique Worker Tracking**: Every worker has a permanent, unique identifier
2. **Automatic ID Assignment**: No manual ID management required for new workers
3. **Migration Support**: Existing workers can be easily updated with IDs
4. **Accurate Stock Management**: Real-time stock levels accounting for collections and sales
5. **Prevented Overselling**: System validation ensures sales don't exceed available stock
6. **Fair Worker Credit**: Eliminates double counting in contribution calculations
7. **Complete Audit Trail**: Full traceability from collection to sale
8. **Financial Insights**: Revenue tracking integrated with material flow
9. **Automated Validations**: Reduces manual errors in stock and sales management

### 10. Technical Notes

#### Worker ID Generation
- **Format**: WP + 3-digit number (WP001, WP002, etc.)
- **Auto-increment**: System finds the highest existing ID and increments
- **Collision Prevention**: Checks for existing IDs to avoid duplicates
- **User Type Filtering**: Only workers (user_type = 1) receive wastepicker_ids

#### Stock Calculation Examples
- **Scenario 1**: 
  - Material collected: 500kg
  - Material sold: 200kg
  - **Available stock**: 300kg
- **Scenario 2**:
  - Material collected: 150kg
  - Material sold: 150kg
  - **Available stock**: 0kg (shown as sold out)

#### Sales Field Detection
The system automatically detects sales collection structure by checking for:
- `weight_sold` (preferred)
- `weight`
- `quantity`
- `amount`

#### Performance Considerations
- Stock calculations use pre-computed worker contributions for speed
- Sales data is cached for quick stock validation
- Real-time validation prevents data inconsistencies
- Worker ID assignment uses bulk operations for efficiency

### 11. Future Enhancements

- Real-time stock alerts when levels are low
- Sales forecasting based on collection trends
- Integration with external accounting systems
- Mobile sales recording interface
- Automated pricing suggestions based on market rates
- Customer relationship management for buyers
- Advanced reporting with profit margins and efficiency metrics
- Worker performance ranking and incentive systems
- QR code generation for worker IDs
- Mobile check-in system for workers 