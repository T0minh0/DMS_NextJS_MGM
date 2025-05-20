import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get('worker_id');
    const materialId = searchParams.get('material_id');
    const periodType = searchParams.get('period_type') || 'monthly'; // Default to monthly
    
    console.log(`API: Connecting to MongoDB for worker collections (${periodType})...`);
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // List all collections to verify names
    const collections = await db.listCollections().toArray();
    console.log('API: Available collections for worker collections:', collections.map(c => c.name));
    
    // Based on repopulate_db.py, we should use measurements collection
    const measurementsCollection = db.collection('measurements');
    const usersCollection = db.collection('users');
    const materialsCollection = db.collection('materials');
    
    // Check if the collection has any documents
    const count = await measurementsCollection.countDocuments();
    console.log(`API: Collection "measurements" has ${count} documents`);
    
    // Get a sample document to see fields
    if (count > 0) {
      const sample = await measurementsCollection.findOne();
      console.log(`API: Sample document from "measurements":`, sample);
    }
    
    // Calculate date range based on period type
    const now = new Date();
    let pastDate = new Date(now);
    
    // Set date range based on period type - only current period
    if (periodType === 'weekly') {
      // Current week
      pastDate.setDate(now.getDate() - now.getDay()); // Beginning of current week (Sunday)
      pastDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(pastDate);
      endDate.setDate(pastDate.getDate() + 6); // End of week (Saturday)
      endDate.setHours(23, 59, 59, 999);
      
      console.log(`API: Date range for weekly: ${pastDate.toISOString()} to ${endDate.toISOString()}`);
    } else if (periodType === 'yearly') {
      // Current year
      pastDate = new Date(now.getFullYear(), 0, 1); // January 1st of current year
      const endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999); // December 31st
      
      console.log(`API: Date range for yearly: ${pastDate.toISOString()} to ${endDate.toISOString()}`);
    } else {
      // Current month (default - monthly)
      pastDate = new Date(now.getFullYear(), now.getMonth(), 1); // First day of current month
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // Last day of current month
      
      console.log(`API: Date range for monthly: ${pastDate.toISOString()} to ${endDate.toISOString()}`);
    }
    
    // Base query with date range
    const query: any = {
      timestamp: {  // Using 'timestamp' as seen in repopulate_db.py
        $gte: pastDate,
        $lte: now
      }
    };
    
    // Add worker filter if provided
    if (workerId) {
      query.wastepicker_id = workerId;  // Using 'wastepicker_id' as seen in repopulate_db.py
    }
    
    // Add material filter if provided
    if (materialId) {
      try {
        // Get material by ID from materials collection
        const material = await db.collection('materials').findOne({
          $or: [
            { _id: materialId },
            { _id: materialId.toString() }
          ]
        });
        
        if (material) {
          query.material_id = material._id.toString();
          console.log(`API: Using material ID: ${query.material_id} (${material.name || 'unnamed'})`);
        } else {
          // Default fallback
          query.material_id = materialId;
          console.log(`API: Using provided material ID directly: ${materialId}`);
        }
      } catch (error) {
        console.error('Error looking up material:', error);
        query.material_id = materialId;
      }
    }
    
    console.log('API: Query for collections:', query);
    
    // If material is specified or we're not in yearly view, use the simple aggregation
    if (materialId || periodType !== 'yearly') {
      // Get top workers by total collection weight (simple version)
      const workerCollections = await measurementsCollection.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$wastepicker_id",
            totalWeight: { $sum: "$Weight" }  // Using 'Weight' as seen in repopulate_db.py
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "wastepicker_id",  // Using 'wastepicker_id' as seen in repopulate_db.py
            as: "worker_info"
          }
        },
        {
          $unwind: {
            path: "$worker_info",
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            wastepicker_id: "$_id",
            worker_name: "$worker_info.full_name",  // Using 'full_name' as seen in repopulate_db.py
            totalWeight: 1,
            _id: 0
          }
        },
        {
          $sort: { totalWeight: -1 }
        },
        {
          $limit: 10
        }
      ]).toArray();
      
      console.log(`API: Found ${workerCollections.length} worker collections`);
      
      // If no data found, return a no-data message with appropriate period indication
      if (workerCollections.length === 0) {
        console.log('API: No worker collections found');
        
        let periodMessage = "este período";
        if (periodType === 'weekly') periodMessage = "esta semana";
        else if (periodType === 'monthly') periodMessage = "este mês";
        else if (periodType === 'yearly') periodMessage = "este ano";
        
        return NextResponse.json({ 
          noData: true, 
          message: materialId 
            ? `Não há coletas deste material em ${periodMessage}` 
            : `Não há coletas disponíveis para ${periodMessage}`
        });
      }
      
      return NextResponse.json({
        grouped: false,
        data: workerCollections
      });
    } else {
      // For yearly view without material filter, get stacked data by material
      // First, get all materials
      const allMaterials = await materialsCollection.find().toArray();
      
      console.log('API: Materials collection sample (first 3 items):',
        allMaterials.slice(0, 3).map(m => ({
          _id: m._id,
          material_id: m.material_id,
          name: m.name,
          material: m.material
        }))
      );
      
      // Then, get worker collections grouped by worker and material
      const stackedWorkerCollections = await measurementsCollection.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              worker: "$wastepicker_id",
              material: "$material_id"
            },
            totalWeight: { $sum: "$Weight" }
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "_id.worker",
            foreignField: "wastepicker_id",
            as: "worker_info"
          }
        },
        {
          $unwind: {
            path: "$worker_info",
            preserveNullAndEmptyArrays: true
          }
        },
        // First lookup - by _id
        {
          $lookup: {
            from: "materials",
            localField: "_id.material",
            foreignField: "_id",
            as: "material_info_by_id"
          }
        },
        // Second lookup - by material_id
        {
          $lookup: {
            from: "materials",
            localField: "_id.material",
            foreignField: "material_id",
            as: "material_info_by_material_id"
          }
        },
        // Add a field that combines results
        {
          $addFields: {
            material_info: {
              $cond: {
                if: { $gt: [{ $size: "$material_info_by_id" }, 0] },
                then: { $arrayElemAt: ["$material_info_by_id", 0] },
                else: {
                  $cond: {
                    if: { $gt: [{ $size: "$material_info_by_material_id" }, 0] },
                    then: { $arrayElemAt: ["$material_info_by_material_id", 0] },
                    else: null
                  }
                }
              }
            }
          }
        },
        {
          $project: {
            wastepicker_id: "$_id.worker",
            worker_name: "$worker_info.full_name",
            material_id: "$_id.material",
            material_name: { 
              $ifNull: [
                "$material_info.name", 
                { $ifNull: [
                  "$material_info.material", 
                  { $concat: ["Material ", { $toString: "$_id.material" }] }
                ]}
              ] 
            },
            weight: "$totalWeight",
            _id: 0
          }
        },
        {
          $sort: { weight: -1 }
        }
      ]).toArray();
      
      // Process the data for stacked chart
      if (stackedWorkerCollections.length === 0) {
        console.log('API: No stacked worker collections found');
        return NextResponse.json({ 
          noData: true, 
          message: `Não há coletas disponíveis para este ano`
        });
      }
      
      // Group by worker
      const workerMap = {};
      stackedWorkerCollections.forEach(collection => {
        if (!workerMap[collection.wastepicker_id]) {
          workerMap[collection.wastepicker_id] = {
            wastepicker_id: collection.wastepicker_id,
            worker_name: collection.worker_name,
            materials: {},
            totalWeight: 0
          };
        }
        
        workerMap[collection.wastepicker_id].materials[collection.material_id] = {
          material_name: collection.material_name,
          weight: collection.weight
        };
        
        workerMap[collection.wastepicker_id].totalWeight += collection.weight;
      });
      
      // Convert to array and sort by total weight
      const sortedWorkers = Object.values(workerMap)
        .sort((a: any, b: any) => b.totalWeight - a.totalWeight)
        .slice(0, 10); // Get top 10 workers
      
      // Get all unique materials used by these workers
      const uniqueMaterialIds = new Set();
      sortedWorkers.forEach((worker: any) => {
        Object.keys(worker.materials).forEach(materialId => {
          uniqueMaterialIds.add(materialId);
        });
      });
      
      // Map material IDs to names and prepare final dataset
      const uniqueMaterials = Array.from(uniqueMaterialIds).map(id => {
        const materialInfo = allMaterials.find(m => {
          return m._id && (m._id.toString() === id.toString() || 
                 m.material_id && m.material_id.toString() === id.toString());
        });
        
        // Extract material name, with fallbacks
        const materialName = materialInfo 
          ? (materialInfo.name || materialInfo.material || `Material ${id}`)
          : `Material ${id}`;
          
        console.log(`Material mapping: ID ${id} -> Name "${materialName}"`);
          
        return {
          id: id.toString(),
          name: materialName
        };
      });
      
      // Create formatted worker data for stacked chart
      const formattedWorkers = sortedWorkers.map((worker: any) => {
        const workerData: any = {
          wastepicker_id: worker.wastepicker_id,
          worker_name: worker.worker_name,
          totalWeight: worker.totalWeight
        };
        
        // Add each material's weight or 0 if not collected
        uniqueMaterials.forEach(material => {
          workerData[material.id] = worker.materials[material.id] 
            ? worker.materials[material.id].weight
            : 0;
        });
        
        return workerData;
      });
      
      console.log(`API: Found ${formattedWorkers.length} stacked worker collections with ${uniqueMaterials.length} materials`);
      console.log('API: Material mapping:', uniqueMaterials.map(m => `${m.id} -> ${m.name}`).join(', '));
      
      return NextResponse.json({
        grouped: true,
        workers: formattedWorkers,
        materials: uniqueMaterials
      });
    }
  } catch (error) {
    console.error('Error fetching worker collections:', error);
    
    // Return error message
    return NextResponse.json({ 
      noData: true, 
      message: "Erro ao buscar dados de coletas. Por favor, tente novamente mais tarde."
    }, { status: 500 });
  }
} 