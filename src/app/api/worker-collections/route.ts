import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

// Helper function to get date range based on period type
function getDateRange(periodType: string) {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();
  
  if (periodType === 'weekly') {
    // Current week (Sunday to Saturday)
    startDate.setDate(now.getDate() - now.getDay());
    startDate.setHours(0, 0, 0, 0);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else if (periodType === 'yearly') {
    // Current year
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else {
    // Monthly (default)
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  
  return { startDate, endDate };
}

// Helper function to get week/month/year number for filtering
function getPeriodNumber(date: Date, periodType: string) {
  if (periodType === 'weekly') {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  } else if (periodType === 'yearly') {
    return date.getFullYear();
  } else {
    return date.getMonth() + 1; // 1-based month
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get('worker_id');
    const materialId = searchParams.get('material_id');
    const periodType = searchParams.get('period_type') || 'monthly';
    
    console.log(`API: Fetching worker collections (${periodType})...`);
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    const workerContributionsCollection = db.collection('worker_contributions');
    const usersCollection = db.collection('users');
    const materialsCollection = db.collection('materials');
    
    // Check if we have calculated contributions
    const contributionsCount = await workerContributionsCollection.countDocuments();
    console.log(`API: Found ${contributionsCount} worker contributions`);
    
    if (contributionsCount === 0) {
      return NextResponse.json({ 
        noData: true, 
        message: "Dados de contribuição não calculados. Execute o recálculo primeiro."
      });
    }
    
    // Get current period info for filtering
    const { startDate, endDate } = getDateRange(periodType);
    const currentPeriod = getPeriodNumber(new Date(), periodType);
    const currentYear = new Date().getFullYear();
    
    console.log(`API: Period info - Type: ${periodType}, Current: ${currentPeriod}, Year: ${currentYear}`);
    
    // Build query for worker_contributions
    const query: any = {};
    
    // Filter by current period
    if (periodType === 'weekly') {
      query['period.week'] = currentPeriod;
      query['period.year'] = currentYear;
    } else if (periodType === 'yearly') {
      query['period.year'] = currentYear;
    } else {
      // For monthly, we need to be more complex as contributions are stored by week
      // We'll need to find all weeks that fall within the current month
      const startWeek = getPeriodNumber(startDate, 'weekly');
      const endWeek = getPeriodNumber(endDate, 'weekly');
      
      if (startDate.getFullYear() === endDate.getFullYear()) {
        query['period.year'] = currentYear;
        query['period.week'] = { $gte: startWeek, $lte: endWeek };
      } else {
        // Month spans two years (December to January)
        query.$or = [
          {
            'period.year': startDate.getFullYear(),
            'period.week': { $gte: startWeek }
          },
          {
            'period.year': endDate.getFullYear(),
            'period.week': { $lte: endWeek }
          }
        ];
      }
    }
    
    // Add worker filter
    if (workerId) {
      query.wastepicker_id = workerId;
    }
    
    // Add material filter
    if (materialId) {
      try {
        if (materialId.startsWith('group_')) {
          const groupName = materialId.replace('group_', '');
          console.log(`API: Processing group: ${groupName}`);
          
          const groupMaterials = await materialsCollection.find({ group: groupName }).toArray();
          if (groupMaterials.length === 0) {
            return NextResponse.json({ 
              noData: true, 
              message: "Não há materiais neste grupo" 
            });
          }
          
          const materialIds = groupMaterials.map(m => m.material_id?.toString() || m._id.toString());
          query.material_id = { $in: materialIds };
        } else {
          query.material_id = materialId;
        }
      } catch (error) {
        console.error('Error processing material filter:', error);
        query.material_id = materialId;
      }
    }
    
    console.log('API: Query for worker contributions:', JSON.stringify(query, null, 2));
    
    // If we want stacked data (yearly without material filter), return grouped data
    if (periodType === 'yearly' && !materialId) {
      // Get all contributions for the year, grouped by worker and material
      const stackedData = await workerContributionsCollection.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              worker: "$wastepicker_id",
              material: "$material_id"
            },
            totalWeight: { $sum: "$weight" }
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
        {
          $lookup: {
            from: "materials",
            let: { materialId: "$_id.material" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      { $eq: [{ $toString: "$_id" }, { $toString: "$$materialId" }] },
                      { $eq: [{ $toString: "$material_id" }, { $toString: "$$materialId" }] }
                    ]
                  }
                }
              }
            ],
            as: "material_info"
          }
        },
        {
          $addFields: {
            material_info: { $arrayElemAt: ["$material_info", 0] }
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
      
      if (stackedData.length === 0) {
        return NextResponse.json({ 
          noData: true, 
          message: `Não há coletas disponíveis para este ano`
        });
      }
      
      // Group by worker
      const workerMap: { [key: string]: any } = {};
      stackedData.forEach(item => {
        if (!workerMap[item.wastepicker_id]) {
          workerMap[item.wastepicker_id] = {
            wastepicker_id: item.wastepicker_id,
            worker_name: item.worker_name,
            materials: {},
            totalWeight: 0
          };
        }
        
        workerMap[item.wastepicker_id].materials[item.material_id] = {
          material_name: item.material_name,
          weight: item.weight
        };
        
        workerMap[item.wastepicker_id].totalWeight += item.weight;
      });
      
      // Get top 10 workers and prepare data
      const sortedWorkers = Object.values(workerMap)
        .sort((a: any, b: any) => b.totalWeight - a.totalWeight)
        .slice(0, 10);
      
      // Get unique materials
      const uniqueMaterialIds = new Set<string>();
      sortedWorkers.forEach((worker: any) => {
        Object.keys(worker.materials).forEach(materialId => {
          uniqueMaterialIds.add(materialId);
        });
      });
      
      const uniqueMaterials = Array.from(uniqueMaterialIds).map(id => {
        const worker = sortedWorkers.find((w: any) => w.materials[id]);
        return {
          id: id.toString(),
          name: worker?.materials[id]?.material_name || `Material ${id}`
        };
      });
      
      // Format data for stacked chart
      const formattedWorkers = sortedWorkers.map((worker: any) => {
        const workerData: any = {
          wastepicker_id: worker.wastepicker_id,
          worker_name: worker.worker_name,
          totalWeight: worker.totalWeight
        };
        
        uniqueMaterials.forEach(material => {
          workerData[material.id] = worker.materials[material.id]?.weight || 0;
        });
        
        return workerData;
      });
      
      console.log(`API: Returning stacked data with ${formattedWorkers.length} workers and ${uniqueMaterials.length} materials`);
      
      return NextResponse.json({
        grouped: true,
        workers: formattedWorkers,
        materials: uniqueMaterials
      });
    } else {
      // Simple aggregation for non-stacked data
      const workerCollections = await workerContributionsCollection.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$wastepicker_id",
            totalWeight: { $sum: "$weight" }
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
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
        {
          $project: {
            wastepicker_id: "$_id",
            worker_name: "$worker_info.full_name",
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
      
      if (workerCollections.length === 0) {
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
      
      console.log(`API: Returning ${workerCollections.length} worker collections`);
      
      return NextResponse.json({
        grouped: false,
        data: workerCollections
      });
    }
    
  } catch (error) {
    console.error('Error fetching worker collections:', error);
    return NextResponse.json({ 
      noData: true, 
      message: "Erro ao buscar dados de coletas. Por favor, tente novamente mais tarde."
    }, { status: 500 });
  }
} 