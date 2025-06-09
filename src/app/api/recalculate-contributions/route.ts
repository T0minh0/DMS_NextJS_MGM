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

interface DailyContribution {
  date: string;
  workerId: string;
  materialId: string;
  netWeight: number;
}

function getWeekNumber(date: Date): { week: number; year: number } {
  // Use ISO week date calculation
  // This ensures that weeks are properly assigned to the correct year
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Set to Thursday of this week to ensure correct year assignment
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  // Get first Thursday of year
  const yearStart = new Date(d.getFullYear(), 0, 4);
  // Calculate week number
  const weekNumber = 1 + Math.round(((d.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getDay() + 6) % 7) / 7);
  
  return { 
    week: weekNumber, 
    year: d.getFullYear() 
  };
}

function calculateDailyContributions(measurements: Measurement[]): DailyContribution[] {
  // Group measurements by worker, material, and date
  const groupedMeasurements: { [key: string]: Measurement[] } = {};
  
  measurements.forEach(measurement => {
    const date = new Date(measurement.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD format
    // Use | as separator to avoid conflicts with date format
    const key = `${measurement.wastepicker_id}|${measurement.material_id}|${date}`;
    
    if (!groupedMeasurements[key]) {
      groupedMeasurements[key] = [];
    }
    groupedMeasurements[key].push(measurement);
  });
  
  const dailyContributions: DailyContribution[] = [];
  
  // Process each group to calculate net contributions
  Object.keys(groupedMeasurements).forEach(key => {
    const [workerId, materialId, date] = key.split('|'); // Split by | instead of -
    const dayMeasurements = groupedMeasurements[key].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    let netWeight = 0;
    
    // Logic: Only count the final weight when bag is filled
    // For multiple measurements in a day, only the difference when bag is marked as filled
    const filledMeasurement = dayMeasurements.find(m => m.bag_filled === 'Y' || m.bag_filled === 'S');
    
    if (filledMeasurement) {
      // If there's a filled measurement, that's the net contribution for the day
      // This assumes that when a bag is filled, it represents the total collected for that material on that day
      netWeight = filledMeasurement.Weight;
    } else {
      // If no bag was marked as filled, take the highest weight measurement
      // This handles cases where bags are being progressively filled but not yet marked as complete
      const maxWeight = Math.max(...dayMeasurements.map(m => m.Weight));
      netWeight = maxWeight;
    }
    
    if (netWeight > 0) {
      dailyContributions.push({
        date,
        workerId,
        materialId,
        netWeight
      });
    }
  });
  
  return dailyContributions;
}

export async function POST(request: NextRequest) {
  try {
    await client.connect();
    const db = client.db('DMS');
    
    console.log('Starting recalculation of worker contributions...');
    
    // Fetch all measurements
    const measurements = await db.collection('measurements').find({}).toArray() as Measurement[];
    console.log(`Found ${measurements.length} measurements to process`);
    
    if (measurements.length === 0) {
      return NextResponse.json({ 
        message: 'No measurements found',
        processed: 0 
      });
    }
    
    // Calculate daily contributions
    const dailyContributions = calculateDailyContributions(measurements);
    console.log(`Calculated ${dailyContributions.length} daily contributions`);
    
    // Group daily contributions by worker, material, and week
    const weeklyContributions: { [key: string]: {
      workerId: string;
      materialId: string;
      week: number;
      year: number;
      totalWeight: number;
      dailyBreakdown: { date: string; weight: number }[];
    }} = {};
    
    dailyContributions.forEach(contribution => {
      const date = new Date(contribution.date);
      const { week, year } = getWeekNumber(date);
      const key = `${contribution.workerId}|${contribution.materialId}|${year}|${week}`;
      
      if (!weeklyContributions[key]) {
        weeklyContributions[key] = {
          workerId: contribution.workerId,
          materialId: contribution.materialId,
          week,
          year,
          totalWeight: 0,
          dailyBreakdown: []
        };
      }
      
      weeklyContributions[key].totalWeight += contribution.netWeight;
      weeklyContributions[key].dailyBreakdown.push({
        date: contribution.date,
        weight: contribution.netWeight
      });
    });
    
    // Fetch materials for pricing calculation
    const materials = await db.collection('materials').find({}).toArray();
    const materialPrices: { [materialId: string]: number } = {};
    
    materials.forEach(material => {
      const materialId = material.material_id?.toString() || material._id.toString();
      // Default price per kg - this should be made configurable
      materialPrices[materialId] = material.price_per_kg || 2.5;
    });
    
    // Clear existing worker_contributions collection
    await db.collection('worker_contributions').deleteMany({});
    console.log('Cleared existing worker contributions');
    
    // Insert new calculated contributions
    const contributionsToInsert = Object.values(weeklyContributions).map(contribution => ({
      wastepicker_id: contribution.workerId,
      material_id: contribution.materialId,
      weight: parseFloat(contribution.totalWeight.toFixed(2)),
      earnings: parseFloat((contribution.totalWeight * (materialPrices[contribution.materialId] || 2.5)).toFixed(2)),
      period: {
        week: contribution.week,
        year: contribution.year
      },
      daily_breakdown: contribution.dailyBreakdown,
      last_updated: new Date()
    }));
    
    if (contributionsToInsert.length > 0) {
      await db.collection('worker_contributions').insertMany(contributionsToInsert);
      console.log(`Inserted ${contributionsToInsert.length} worker contributions`);
    }
    
    // Calculate summary statistics
    const totalWorkers = new Set(dailyContributions.map(c => c.workerId)).size;
    const totalMaterials = new Set(dailyContributions.map(c => c.materialId)).size;
    const totalWeight = contributionsToInsert.reduce((sum, c) => sum + c.weight, 0);
    const totalEarnings = contributionsToInsert.reduce((sum, c) => sum + c.earnings, 0);
    
    return NextResponse.json({
      message: 'Worker contributions recalculated successfully',
      statistics: {
        totalMeasurements: measurements.length,
        dailyContributions: dailyContributions.length,
        weeklyContributions: contributionsToInsert.length,
        totalWorkers,
        totalMaterials,
        totalWeight: parseFloat(totalWeight.toFixed(2)),
        totalEarnings: parseFloat(totalEarnings.toFixed(2))
      },
      processed: contributionsToInsert.length
    });
    
  } catch (error) {
    console.error('Error recalculating contributions:', error);
    return NextResponse.json({ 
      error: 'Failed to recalculate contributions',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  } finally {
    await client.close();
  }
} 