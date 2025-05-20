import { NextResponse } from 'next/server';
import clientPromise, { getDbFromClient } from '@/lib/mongodb';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get('material_id');
    const periodType = searchParams.get('period_type') || 'monthly'; // Default to monthly if not specified
    
    console.log(`API: Connecting to MongoDB for earnings comparison (${periodType})...`);
    const client = await clientPromise;
    const db = getDbFromClient(client);
    
    // Check if sales collection exists
    const salesExist = await db.listCollections({ name: 'sales' }).hasNext();
    
    console.log(`API: Collections exist - sales: ${salesExist}`);
    
    // If sales collection doesn't exist, return no data message
    if (!salesExist) {
      console.log('API: Required collections not found, returning no data message');
      return NextResponse.json({ 
        noData: true, 
        message: materialId 
          ? "Não há vendas registradas para este material" 
          : "Não há dados de vendas disponíveis"
      });
    }
    
    // Collections
    const salesColl = db.collection('sales');
    
    // Get the current date
    const now = new Date();
    
    // Number of periods to fetch and format settings based on period type
    const periodsData = [];
    const numberOfPeriods = 6;
    
    // Handle different period types
    if (periodType === 'weekly') {
      // Weekly periods - each period is 7 days
      for (let i = 0; i < numberOfPeriods; i++) {
        // Calculate start and end of the week
        const endWeek = new Date(now);
        endWeek.setDate(now.getDate() - (i * 7));
        
        const startWeek = new Date(endWeek);
        startWeek.setDate(endWeek.getDate() - 6);
        
        // Build the query
        const periodQuery: any = {
          date: {
            $gte: startWeek,
            $lte: endWeek
          }
        };
        
        // Add material filter if provided
        if (materialId) {
          periodQuery.material_id = materialId;
        }
        
        // Get all sales for this week
        const weeklySales = await salesColl.find(periodQuery).toArray();
        
        // Calculate total earnings (price/kg is already in the document)
        let totalEarnings = 0;
        weeklySales.forEach(sale => {
          totalEarnings += (sale.price_kg || sale['price/kg'] || 0) * (sale.weight_sold || 0);
        });
        
        // Format the week as "DD/MM - DD/MM"
        const startStr = `${startWeek.getDate().toString().padStart(2, '0')}/${(startWeek.getMonth() + 1).toString().padStart(2, '0')}`;
        const endStr = `${endWeek.getDate().toString().padStart(2, '0')}/${(endWeek.getMonth() + 1).toString().padStart(2, '0')}`;
        const weekLabel = `${startStr} - ${endStr}`;
        
        periodsData.push({
          period: weekLabel,
          earnings: totalEarnings
        });
      }
    } else if (periodType === 'yearly') {
      // Yearly periods
      for (let i = 0; i < numberOfPeriods; i++) {
        const year = now.getFullYear() - i;
        const startYear = new Date(year, 0, 1); // January 1st
        const endYear = new Date(year, 11, 31, 23, 59, 59); // December 31st
        
        // Build the query
        const periodQuery: any = {
          date: {
            $gte: startYear,
            $lte: endYear
          }
        };
        
        // Add material filter if provided
        if (materialId) {
          periodQuery.material_id = materialId;
        }
        
        // Get all sales for this year
        const yearlySales = await salesColl.find(periodQuery).toArray();
        
        // Calculate total earnings (price/kg is already in the document)
        let totalEarnings = 0;
        yearlySales.forEach(sale => {
          totalEarnings += (sale.price_kg || sale['price/kg'] || 0) * (sale.weight_sold || 0);
        });
        
        periodsData.push({
          period: year.toString(),
          earnings: totalEarnings
        });
      }
    } else {
      // Monthly periods (default)
      for (let i = 0; i < numberOfPeriods; i++) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        
        // Build the query
        const periodQuery: any = {
          date: {
            $gte: month,
            $lte: nextMonth
          }
        };
        
        // Add material filter if provided
        if (materialId) {
          periodQuery.material_id = materialId;
        }
        
        // Get all sales for this month
        const monthlySales = await salesColl.find(periodQuery).toArray();
        
        // Calculate total earnings (price/kg is already in the document)
        let totalEarnings = 0;
        monthlySales.forEach(sale => {
          totalEarnings += (sale.price_kg || sale['price/kg'] || 0) * (sale.weight_sold || 0);
        });
        
        // Format the month name
        const monthLabel = month.toLocaleString('pt-BR', { month: 'short' });
        
        periodsData.push({
          period: monthLabel,
          earnings: totalEarnings
        });
      }
    }
    
    // Reverse the array to get chronological order
    periodsData.reverse();
    
    // Log the results for debugging
    console.log(`API: Earnings data for ${periodType} periods:`, 
      periodsData.map(pd => `${pd.period}: ${pd.earnings.toFixed(2)}`));
    
    // If no data or no earnings, return an appropriate message
    if (periodsData.length === 0 || periodsData.every(item => item.earnings === 0)) {
      console.log('API: No earnings data found');
      return NextResponse.json({ 
        noData: true, 
        message: materialId 
          ? "Não há vendas registradas para este material" 
          : "Não há dados de vendas disponíveis"
      });
    }
    
    return NextResponse.json(periodsData);
  } catch (error) {
    console.error('Error fetching earnings comparison:', error);
    
    // Return error message
    return NextResponse.json({ 
      noData: true, 
      message: "Erro ao buscar dados de vendas. Por favor, tente novamente mais tarde."
    }, { status: 500 });
  }
} 