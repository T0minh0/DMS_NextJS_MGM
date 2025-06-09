import { NextRequest, NextResponse } from 'next/server';
import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI!;
const client = new MongoClient(MONGODB_URI);

interface Measurement {
  _id: ObjectId;
  Weight: number;
  timestamp: string;
  wastepicker_id: string;
  material_id: string;
  device_id: string;
  bag_filled: string;
}

interface ProcessedMeasurement {
  date: string;
  weight: number;
  bag_filled: string;
  timestamp: string;
  net_contribution: number;
}

interface MaterialContribution {
  materialName: string;
  weight: number;
  measurements: Array<{
    date: string;
    weight: number;
    bag_filled: string;
    timestamp: string;
  }>;
}

interface WeeklyContribution {
  week: string;
  weekStart: string;
  weekEnd: string;
  materials: { [materialId: string]: MaterialContribution };
  totalWeight: number;
}

interface ProductivityStats {
  totalWeeks: number;
  totalWeight: number;
  averageWeekly: number;
  bestWeek: {
    week: string;
    weight: number;
  };
  topMaterials: Array<{
    materialName: string;
    totalWeight: number;
  }>;
}

function getWeekNumber(date: Date): string {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
  const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  return `${year}W${weekNumber.toString().padStart(2, '0')}`;
}

function getWeekStartEnd(weekString: string): { start: string; end: string } {
  const [year, weekNum] = weekString.split('W');
  const yearNum = parseInt(year);
  const week = parseInt(weekNum);
  
  // Get the first day of the year
  const firstDay = new Date(yearNum, 0, 1);
  
  // Find the first Monday of the year
  const firstMonday = new Date(firstDay);
  const dayOfWeek = firstDay.getDay();
  const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  firstMonday.setDate(firstDay.getDate() + daysToAdd);
  
  // Calculate the start of the target week
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (week - 2) * 7);
  
  // Calculate the end of the week (Sunday)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  return {
    start: weekStart.toLocaleDateString('pt-BR'),
    end: weekEnd.toLocaleDateString('pt-BR')
  };
}

function calculateNetContributions(measurements: Measurement[]): ProcessedMeasurement[] {
  // Group measurements by date and material
  const groupedByDay: { [key: string]: Measurement[] } = {};
  
  measurements.forEach(measurement => {
    const date = new Date(measurement.timestamp).toLocaleDateString('pt-BR');
    const key = `${date}-${measurement.material_id}`;
    
    if (!groupedByDay[key]) {
      groupedByDay[key] = [];
    }
    groupedByDay[key].push(measurement);
  });
  
  const processedMeasurements: ProcessedMeasurement[] = [];
  
  // Process each day-material combination
  Object.keys(groupedByDay).forEach(key => {
    const dayMeasurements = groupedByDay[key].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    let previousWeight = 0;
    
    dayMeasurements.forEach((measurement, index) => {
      let netContribution = 0;
      
      if (index === 0) {
        // First measurement of the day
        netContribution = measurement.Weight;
      } else {
        // Subsequent measurements - calculate the difference
        netContribution = measurement.Weight - previousWeight;
      }
      
      // If bag is filled (marked as 'Y' or 'S'), this is the final contribution
      if (measurement.bag_filled === 'Y' || measurement.bag_filled === 'S') {
        // The net contribution is the final weight minus any previous measurements
        netContribution = measurement.Weight - (index > 0 ? dayMeasurements[0].Weight : 0);
      }
      
      processedMeasurements.push({
        date: new Date(measurement.timestamp).toLocaleDateString('pt-BR'),
        weight: measurement.Weight,
        bag_filled: measurement.bag_filled,
        timestamp: measurement.timestamp,
        net_contribution: Math.max(0, netContribution) // Ensure no negative contributions
      });
      
      previousWeight = measurement.Weight;
    });
  });
  
  return processedMeasurements;
}

export async function GET(request: NextRequest) {
  try {
    await client.connect();
    const db = client.db('DMS');
    
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get('worker_id');
    const weeks = parseInt(searchParams.get('weeks') || '12');
    
    if (!workerId) {
      return NextResponse.json({ error: 'Worker ID is required' }, { status: 400 });
    }
    
    // Calculate date range for the requested number of weeks
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - (weeks * 7));
    
    console.log(`API: Fetching measurements for ${workerId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Fetch measurements for the worker in the specified period
    const measurements = await db.collection('measurements').find({
      wastepicker_id: workerId,
      timestamp: {
        $gte: startDate,
        $lte: endDate
      }
    }).toArray() as Measurement[];
    
    console.log(`API: Found ${measurements.length} measurements for ${workerId}`);
    
    // Fetch materials for proper naming
    const materials = await db.collection('materials').find({}).toArray();
    const materialMap = new Map();
    materials.forEach(material => {
      materialMap.set(material.material_id?.toString() || material._id.toString(), 
                     material.name || material.material || `Material ${material.material_id || material._id}`);
    });
    
    if (measurements.length === 0) {
      return NextResponse.json({
        weeklyContributions: [],
        stats: {
          totalWeeks: 0,
          totalWeight: 0,
          averageWeekly: 0,
          bestWeek: { week: '', weight: 0 },
          topMaterials: []
        }
      });
    }
    
    // Calculate net contributions
    const processedMeasurements = calculateNetContributions(measurements);
    
    // Group by week and material
    const weeklyData: { [week: string]: { [materialId: string]: ProcessedMeasurement[] } } = {};
    
    processedMeasurements.forEach(measurement => {
      const date = new Date(measurement.timestamp);
      const week = getWeekNumber(date);
      const materialId = measurements.find(m => m.timestamp === measurement.timestamp)?.material_id || 'unknown';
      
      if (!weeklyData[week]) {
        weeklyData[week] = {};
      }
      
      if (!weeklyData[week][materialId]) {
        weeklyData[week][materialId] = [];
      }
      
      weeklyData[week][materialId].push(measurement);
    });
    
    // Build weekly contributions
    const weeklyContributions: WeeklyContribution[] = [];
    
    Object.keys(weeklyData).sort().forEach(week => {
      const weekMaterials: { [materialId: string]: MaterialContribution } = {};
      let totalWeight = 0;
      
      Object.keys(weeklyData[week]).forEach(materialId => {
        const materialMeasurements = weeklyData[week][materialId];
        const materialWeight = materialMeasurements.reduce((sum, m) => sum + m.net_contribution, 0);
        
        weekMaterials[materialId] = {
          materialName: materialMap.get(materialId) || materialId,
          weight: materialWeight,
          measurements: materialMeasurements.map(m => ({
            date: m.date,
            weight: m.weight,
            bag_filled: m.bag_filled,
            timestamp: m.timestamp
          }))
        };
        
        totalWeight += materialWeight;
      });
      
      const { start, end } = getWeekStartEnd(week);
      
      weeklyContributions.push({
        week,
        weekStart: start,
        weekEnd: end,
        materials: weekMaterials,
        totalWeight
      });
    });
    
    // Calculate statistics
    const totalWeight = weeklyContributions.reduce((sum, week) => sum + week.totalWeight, 0);
    const totalWeeks = weeklyContributions.length;
    const averageWeekly = totalWeeks > 0 ? totalWeight / totalWeeks : 0;
    
    const bestWeek = weeklyContributions.reduce((best, current) => 
      current.totalWeight > best.totalWeight ? current : best,
      { week: '', totalWeight: 0 }
    );
    
    // Calculate top materials
    const materialTotals: { [materialName: string]: number } = {};
    weeklyContributions.forEach(week => {
      Object.values(week.materials).forEach(material => {
        if (!materialTotals[material.materialName]) {
          materialTotals[material.materialName] = 0;
        }
        materialTotals[material.materialName] += material.weight;
      });
    });
    
    const topMaterials = Object.entries(materialTotals)
      .map(([materialName, totalWeight]) => ({ materialName, totalWeight }))
      .sort((a, b) => b.totalWeight - a.totalWeight)
      .slice(0, 5);
    
    const stats: ProductivityStats = {
      totalWeeks,
      totalWeight,
      averageWeekly,
      bestWeek: {
        week: bestWeek.week,
        weight: bestWeek.totalWeight
      },
      topMaterials
    };
    
    // Update worker_contributions collection with calculated data
    for (const week of weeklyContributions) {
      for (const [materialId, material] of Object.entries(week.materials)) {
        if (material.weight > 0) {
          const existingContribution = await db.collection('worker_contributions').findOne({
            wastepicker_id: workerId,
            material_id: materialId,
            'period.week': week.week.split('W')[1],
            'period.year': parseInt(week.week.split('W')[0])
          });
          
          if (!existingContribution) {
            // Calculate earnings (this would depend on material prices - placeholder for now)
            const earnings = material.weight * 2.5; // Example: R$ 2.50 per kg
            
            await db.collection('worker_contributions').insertOne({
              wastepicker_id: workerId,
              material_id: materialId,
              weight: material.weight,
              earnings: earnings,
              period: {
                week: parseInt(week.week.split('W')[1]),
                year: parseInt(week.week.split('W')[0])
              },
              last_updated: new Date()
            });
          }
        }
      }
    }
    
    return NextResponse.json({
      weeklyContributions: weeklyContributions.reverse(), // Most recent first
      stats
    });
    
  } catch (error) {
    console.error('Error fetching worker productivity:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch worker productivity data',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    await client.close();
  }
} 