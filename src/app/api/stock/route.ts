import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('material_id');
    
    console.log('API: Connecting to MongoDB for stock...');
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // Use the worker_contributions, materials, and sales collections
    const workerContributionsCollection = db.collection('worker_contributions');
    const materialsCollection = db.collection('materials');
    const salesCollection = db.collection('sales');
    
    // Check if we have calculated contributions
    const contributionsCount = await workerContributionsCollection.countDocuments();
    console.log(`API: Found ${contributionsCount} worker contributions`);
    
    if (contributionsCount === 0) {
      return NextResponse.json({ 
        noData: true, 
        message: "Dados de contribuição não calculados. Execute o recálculo primeiro."
      });
    }
    
    // Fetch all materials first to ensure we have the correct names
    const allMaterials = await materialsCollection.find({}).toArray();
    console.log(`API: Found ${allMaterials.length} materials in the materials collection`);
    
    // Create a mapping dictionary from material ID to name
    const materialMap: Record<string, string> = {};
    allMaterials.forEach(material => {
      const materialIdKey = material.material_id?.toString() || material._id.toString();
      materialMap[materialIdKey] = material.name || material.material || `Material ${materialIdKey}`;
    });
    
    // Build query for filtering
    const matchQuery: any = {};
    
    // Check if this is a group selection
    if (materialId && materialId.startsWith('group_')) {
      const groupName = materialId.replace('group_', '');
      console.log(`API: Processing group: ${groupName}`);
      
      // Find all materials that belong to this group
      const groupMaterials = await materialsCollection.find({ group: groupName }).toArray();
      console.log(`API: Found ${groupMaterials.length} materials in group "${groupName}"`);
      
      if (groupMaterials.length === 0) {
        return NextResponse.json({ 
          noData: true, 
          message: "Não há materiais neste grupo" 
        });
      }
      
      // Get material IDs
      const materialIds = groupMaterials.map(m => m.material_id?.toString() || m._id.toString());
      console.log(`API: Material IDs in group: ${materialIds}`);
      
      matchQuery.material_id = { $in: materialIds };
    } else if (materialId) {
      // Single material filter
      matchQuery.material_id = materialId;
    }
    
    // Get total collected weights from worker_contributions
    console.log('API: Fetching total collected weights from worker_contributions...');
    const collectedData = await workerContributionsCollection.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$material_id",
          totalCollected: { $sum: "$weight" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]).toArray();
    
    console.log(`API: Collected data (${collectedData.length} items):`, collectedData);
    
    // Get total sold weights from sales collection
    console.log('API: Fetching total sold weights from sales...');
    const salesMatchQuery = { ...matchQuery };
    
    // Check if sales collection exists and has documents
    const salesCount = await salesCollection.countDocuments();
    let salesData: any[] = [];
    
    if (salesCount > 0) {
      // Sample a sales document to understand the structure
      const sampleSale = await salesCollection.findOne();
      console.log('API: Sample sales document:', sampleSale);
      
      // Adapt query based on actual sales collection structure
      // Common field names: weight_sold, quantity, amount, weight
      const possibleWeightFields = ['weight_sold', 'weight', 'quantity', 'amount'];
      let weightField = 'weight_sold'; // default
      
      if (sampleSale) {
        for (const field of possibleWeightFields) {
          if (sampleSale[field] !== undefined) {
            weightField = field;
            break;
          }
        }
      }
      
      console.log(`API: Using weight field: ${weightField}`);
      
      salesData = await salesCollection.aggregate([
        { $match: salesMatchQuery },
        {
          $group: {
            _id: "$material_id",
            totalSold: { $sum: `$${weightField}` }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]).toArray();
    }
    
    console.log(`API: Sales data (${salesData.length} items):`, salesData);
    
    // Convert sales data to a map for easy lookup
    const salesMap: Record<string, number> = {};
    salesData.forEach(item => {
      if (item._id) {
        salesMap[item._id.toString()] = item.totalSold || 0;
      }
    });
    
    // Calculate current stock: collected - sold
    const formattedStock: Record<string, number> = {};
    collectedData.forEach(item => {
      if (!item._id) return;
      
      const materialIdKey = item._id.toString();
      
      // Get material name from our mapping
      const materialName = materialMap[materialIdKey] || `Material ${materialIdKey}`;
      
      const totalCollected = item.totalCollected || 0;
      const totalSold = salesMap[materialIdKey] || 0;
      const currentStock = Math.max(0, totalCollected - totalSold); // Ensure stock doesn't go negative
      
      // Only include materials with stock > 0 or if filtering for specific material
      if (currentStock > 0 || materialId) {
        formattedStock[materialName] = currentStock;
      }
    });
    
    console.log(`API: Formatted stock data (after subtracting sales):`, formattedStock);
    
    // If no data found for a specific material, return a special response
    if (materialId && Object.keys(formattedStock).length === 0) {
      console.log('API: No stock data found for specific material');
      return NextResponse.json({ 
        noData: true, 
        message: "Não há estoque deste material ou foi totalmente vendido" 
      });
    }
    
    // If no data found at all, return message
    if (Object.keys(formattedStock).length === 0) {
      console.log('API: No stock data found');
      return NextResponse.json({ 
        noData: true, 
        message: "Não há estoque disponível ou todos os materiais foram vendidos"
      });
    }
    
    return NextResponse.json(formattedStock);
    
  } catch (error) {
    console.error('Error fetching stock:', error);
    return NextResponse.json({ 
      noData: true, 
      message: "Erro ao buscar dados de estoque. Por favor, tente novamente mais tarde."
    }, { status: 500 });
  }
} 