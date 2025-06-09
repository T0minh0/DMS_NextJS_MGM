import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    console.log('🔍 DEBUG: Checking data state...');
    
    // Check workers
    const workersCount = await db.collection('users').countDocuments({ user_type: 1 });
    const workersWithIds = await db.collection('users').countDocuments({ 
      user_type: 1, 
      wastepicker_id: { $exists: true, $ne: null, $ne: "" } 
    });
    const sampleWorkers = await db.collection('users').find({ user_type: 1 }).limit(3).toArray();
    
    // Check measurements
    const measurementsCount = await db.collection('measurements').countDocuments();
    const sampleMeasurements = await db.collection('measurements').find({}).limit(3).toArray();
    
    // Check worker_contributions
    const contributionsCount = await db.collection('worker_contributions').countDocuments();
    const sampleContributions = await db.collection('worker_contributions').find({}).limit(3).toArray();
    
    // Check materials
    const materialsCount = await db.collection('materials').countDocuments();
    const sampleMaterials = await db.collection('materials').find({}).limit(3).toArray();
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      workers: {
        total: workersCount,
        withWastepickerId: workersWithIds,
        withoutWastepickerId: workersCount - workersWithIds,
        sample: sampleWorkers.map(w => ({
          _id: w._id,
          full_name: w.full_name,
          user_type: w.user_type,
          wastepicker_id: w.wastepicker_id || 'MISSING'
        }))
      },
      measurements: {
        total: measurementsCount,
        sample: sampleMeasurements.map(m => ({
          _id: m._id,
          weight: m.weight || m.Weight,
          wastepicker_id: m.wastepicker_id,
          material_id: m.material_id,
          timestamp: m.timestamp,
          bag_filled: m.bag_filled
        }))
      },
      worker_contributions: {
        total: contributionsCount,
        sample: sampleContributions.map(c => ({
          _id: c._id,
          wastepicker_id: c.wastepicker_id,
          material_id: c.material_id,
          weight: c.weight,
          period: c.period
        }))
      },
      materials: {
        total: materialsCount,
        sample: sampleMaterials.map(m => ({
          _id: m._id,
          material_id: m.material_id,
          name: m.name || m.material
        }))
      }
    };
    
    console.log('🔍 DEBUG INFO:', JSON.stringify(debugInfo, null, 2));
    
    return NextResponse.json(debugInfo);
    
  } catch (error) {
    console.error('Debug check error:', error);
    return NextResponse.json({ 
      error: 'Debug check failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 