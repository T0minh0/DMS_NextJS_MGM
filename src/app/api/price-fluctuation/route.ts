import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('material_id');
    
    console.log('API: Connecting to MongoDB for price fluctuation...');
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    console.log('API: Material ID filter:', materialId);
    
    // Check if sales collection exists
    const salesExist = await db.listCollections({ name: 'sales' }).hasNext();
    
    console.log(`API: Sales collection exists: ${salesExist}`);
    
    // If required collections don't exist, return no data message
    if (!salesExist) {
      console.log('API: Sales collection not found, returning no data message');
      return NextResponse.json({ 
        noData: true, 
        message: materialId 
          ? "Não há histórico de preços para este material" 
          : "Não há histórico de preços disponível"
      });
    }
    
    // Collections
    const salesCollection = db.collection('sales');
    let materialsCollection;
    
    try {
      // Try both "materials" and "waste_type" collections for material names
      const materialsExists = await db.listCollections({ name: 'materials' }).hasNext();
      const wasteTypeExists = await db.listCollections({ name: 'waste_type' }).hasNext();
      
      if (materialsExists) {
        materialsCollection = db.collection('materials');
        console.log('API: Using materials collection');
      } else if (wasteTypeExists) {
        materialsCollection = db.collection('waste_type');
        console.log('API: Using waste_type collection');
      }
    } catch (error) {
      console.error('Error checking material collections:', error);
    }
    
    // Log all available collections to debug
    const collections = await db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
    // Get all materials first to have a proper name mapping
    const materialNameMap = {};
    try {
      if (materialsCollection) {
        const allMaterials = await materialsCollection.find({}).toArray();
        console.log(`API: Found ${allMaterials.length} materials`);
        
        allMaterials.forEach(material => {
          // Store by both material_id and _id for flexible lookups
          const matId = material.material_id?.toString() || material._id?.toString();
          materialNameMap[matId] = material.name || material.material || `Material ${matId}`;
        });
        
        console.log('Material name map:', materialNameMap);
      }
    } catch (error) {
      console.error('Error fetching materials:', error);
    }
    
    // Base query to get sales data - no date restriction
    const query: any = {};
    
    // Add material filter if provided
    if (materialId) {
      // Try both string and number conversions for flexibility
      query.$or = [
        { material_id: materialId.toString() },
        { material_id: parseInt(materialId) }
      ];
      
      // Log query for debugging
      console.log('API: Material query:', JSON.stringify(query));
      
      // Check if this material has any sales first
      const salesCount = await salesCollection.countDocuments(query);
      console.log(`API: Found ${salesCount} sales for material ID ${materialId}`);
      
      if (salesCount === 0) {
        console.log(`API: No sales found for material ID ${materialId}`);
        return NextResponse.json({ 
          noData: true, 
          message: "Não há histórico de preços para este material" 
        });
      }
      
      // Fetch the last 10 sales for this material, sorted by date descending
      const recentSales = await salesCollection.find(query)
        .sort({ date: -1 })
        .limit(10)
        .toArray();
        
      console.log(`API: Found ${recentSales.length} recent sales records`);
      
      // Reverse to get chronological order (oldest to newest)
      recentSales.reverse();
      
      // Get the material name from our mapping
      const materialName = materialNameMap[materialId] || `Material ${materialId}`;
      console.log(`API: Using material name: ${materialName}`);
      
      // Format the sales data with proper dates
      const formattedData = recentSales.map(sale => {
        const date = new Date(sale.date);
        const monthNames = [
          'jan', 'fev', 'mar', 'abr',
          'mai', 'jun', 'jul', 'ago',
          'set', 'out', 'nov', 'dez'
        ];
        const monthName = monthNames[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear().toString().slice(-2); // Get last 2 digits of year
        
        return {
          date: sale.date,
          material: materialName,
          price: sale["price/kg"],
          dateLabel: `${day} ${monthName} ${year}`,
          // Store timestamp for sorting
          timestamp: date.getTime()
        };
      });
      
      console.log('API: Formatted sale data sample:', formattedData.slice(0, 2));
      return NextResponse.json(formattedData);
    } else {
      // Get top 5 materials with recent sales
      const materialsWithSales = await salesCollection.aggregate([
        { $sort: { date: -1 } }, // Sort by most recent sales first
        { 
          $group: { 
            _id: "$material_id", 
            lastSaleDate: { $first: "$date" },
            lastPrice: { $first: "$price/kg" },
            count: { $sum: 1 } 
          } 
        },
        { $match: { count: { $gt: 0 } } },
        { $sort: { lastSaleDate: -1 } }, // Sort by most recently sold materials
        { $limit: 5 }
      ]).toArray();
      
      console.log(`API: Found ${materialsWithSales.length} materials with sales`);
      
      // If no materials with sales found, return no data
      if (materialsWithSales.length === 0) {
        console.log('API: No materials with sales found');
        return NextResponse.json({ 
          noData: true, 
          message: "Não há histórico de preços disponível" 
        });
      }
      
      // Map material IDs to their proper names
      const materialsWithNames = materialsWithSales.map(material => {
        const matId = material._id?.toString();
        return {
          material_id: matId,
          material: materialNameMap[matId] || `Material ${matId}`,
          lastSaleDate: material.lastSaleDate,
          lastPrice: material.lastPrice
        };
      });
      
      console.log('API: Materials with names:', materialsWithNames);
      
      // For each material, get the last 10 sales
      const salesByMaterial = {};
      
      for (const material of materialsWithNames) {
        const materialQuery = {
          $or: [
            { material_id: material.material_id.toString() },
            { material_id: parseInt(material.material_id) }
          ]
        };
        
        // Get last 10 sales for this material, sorted by most recent first
        const recentSales = await salesCollection.find(materialQuery)
          .sort({ date: -1 })
          .limit(10)
          .toArray();
          
        // Reverse to get chronological order
        recentSales.reverse();
        
        // Format the sales data
        const formattedSales = recentSales.map(sale => {
          const date = new Date(sale.date);
          const monthNames = [
            'jan', 'fev', 'mar', 'abr',
            'mai', 'jun', 'jul', 'ago',
            'set', 'out', 'nov', 'dez'
          ];
          const monthName = monthNames[date.getMonth()];
          const day = date.getDate();
          const year = date.getFullYear().toString().slice(-2);
          
          return {
            date: sale.date,
            price: sale["price/kg"],
            dateLabel: `${day} ${monthName} ${year}`,
            timestamp: date.getTime()
          };
        });
        
        salesByMaterial[material.material] = formattedSales;
      }
      
      // Collect all unique dates across all materials
      const allDates = new Set();
      Object.values(salesByMaterial).forEach((sales: any[]) => {
        sales.forEach(sale => {
          allDates.add(sale.dateLabel);
        });
      });
      
      // Convert to array and sort chronologically by timestamp
      const uniqueDatesMap = {};
      
      // Get timestamps for each date label for proper sorting
      Object.entries(salesByMaterial).forEach(([material, sales]) => {
        (sales as any[]).forEach(sale => {
          if (!uniqueDatesMap[sale.dateLabel]) {
            uniqueDatesMap[sale.dateLabel] = sale.timestamp;
          }
        });
      });
      
      const sortedLabels = Object.keys(uniqueDatesMap).sort((a, b) => {
        return uniqueDatesMap[a] - uniqueDatesMap[b];
      });
      
      // Create the formatted data structure
      const priceData = sortedLabels.map(dateLabel => {
        const materials = {};
        
        // For each material, find the sale on this date if exists
        Object.entries(salesByMaterial).forEach(([material, sales]) => {
          const sale = (sales as any[]).find(s => s.dateLabel === dateLabel);
          if (sale) {
            materials[material] = sale.price;
          }
        });
        
        return {
          weekLabel: dateLabel,
          date: new Date(uniqueDatesMap[dateLabel]),
          materials
        };
      });
      
      console.log('API: Final price data points:', priceData.length);
      
      return NextResponse.json({
        materials: materialsWithNames.map(m => m.material),
        priceData
      });
    }
  } catch (error) {
    console.error('Error fetching price fluctuation:', error);
    
    return NextResponse.json({ 
      noData: true, 
      message: "Erro ao buscar dados de preços" 
    });
  }
} 