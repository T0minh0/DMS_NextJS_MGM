"use client";

import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/Layout'; // Assuming @ is configured for src
import { FaFilter, FaBirthdayCake, FaBoxes, FaUsers, FaWeightHanging, FaDollarSign, FaCalendarAlt } from 'react-icons/fa'; // Added Fa* icons
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Map icon names from stats to actual components
const iconComponents: { [key: string]: React.ElementType } = {
  FaBoxes,
  FaUsers,
  FaWeightHanging,
  FaDollarSign,
};

// Add this interface for the stock data
interface StockDataItem {
  [key: string]: number | boolean | string | undefined;
  noData?: boolean;
  message?: string;
}

interface MaterialNameMap {
  [key: string]: string;
}

interface User {
  id: string;
  name?: string;
  full_name?: string;
  userType: number;
  notFound?: boolean;
}

export default function HomePage() {
  // State for filter values
  const [materialFilter, setMaterialFilter] = useState<string>('');
  const [workerFilter, setWorkerFilter] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<string>('monthly');
  const [user, setUser] = useState<User | null>(null);
  
  // State for data
  const [materials, setMaterials] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [stockData, setStockData] = useState<StockDataItem>({});
  const [earningsData, setEarningsData] = useState<any[]>([]);
  const [workerCollections, setWorkerCollections] = useState<any>({ grouped: false, data: [] });
  const [priceFluctuationData, setPriceFluctuationData] = useState<any>({});
  const [birthdays, setBirthdays] = useState<any[]>([]);
  const [noDataMessages, setNoDataMessages] = useState<Record<string, string | null>>({
    stock: null,
    earnings: null,
    workerCollections: null,
    priceFluctuation: null
  });
  
  // Loading states
  const [loading, setLoading] = useState({
    materials: true,
    workers: true,
    stock: true,
    earnings: true,
    workerCollections: true,
    priceFluctuation: true,
    birthdays: true,
  });

  // Get user data from localStorage on page load
  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        
        // Fetch real user data from the database
        const fetchRealUserData = async () => {
          try {
            const response = await fetch(`/api/user?id=${parsedUser.id}`);
            if (response.ok) {
              const realUserData = await response.json();
              console.log('Real user data fetched:', realUserData);
              
              // Create updated user object
              const updatedUser = {
                ...parsedUser,
                full_name: realUserData.full_name,
                name: realUserData.name || realUserData.full_name
              };
              
              // Update the user state with real data
              setUser(updatedUser);
              
              // Store the enhanced user data in localStorage
              localStorage.setItem('user', JSON.stringify(updatedUser));
            }
          } catch (error) {
            console.error('Error fetching real user data:', error);
          }
        };
        
        fetchRealUserData();
      } catch (error) {
        console.error('Failed to parse user data:', error);
      }
    }
  }, []);

  // Stats calculations
  const totalMaterials = materials.length;
  const totalWorkers = workers.length;
  const totalStock = Object.entries(stockData)
    .filter(([key, value]) => typeof value === 'number')
    .reduce((sum: number, [_, value]) => sum + (value as number), 0);
  
  // Calculate total earnings for the current month
  const currentMonthEarnings = earningsData.length > 0 
    ? earningsData[earningsData.length - 1].earnings 
    : 0;

  // Format current date for welcome message
  const currentDate = useMemo(() => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return now.toLocaleDateString('pt-BR', options);
  }, []);

  // Fetch materials for the filter
  useEffect(() => {
    async function fetchMaterials() {
      try {
        console.log('Fetching materials...');
        const response = await fetch('/api/materials');
        console.log('Materials API response status:', response.status, response.statusText);
        
        if (!response.ok) throw new Error(`Failed to fetch materials: ${response.status} ${response.statusText}`);
        
        const data = await response.json();
        console.log('Materials data received:', data);
        console.log('Materials data type:', typeof data);
        console.log('Is materials data an array?', Array.isArray(data));
        console.log('Materials data length:', data.length);
        
        if (Array.isArray(data)) {
          setMaterials(data);
          console.log('Materials state updated with data');
        } else {
          console.error('Materials data is not an array:', data);
        }
      } catch (error) {
        console.error('Error fetching materials:', error);
      } finally {
        setLoading(prev => ({ ...prev, materials: false }));
        console.log('Materials loading state set to false');
      }
    }
    
    fetchMaterials();
  }, []);

  // Fetch workers for the filter
  useEffect(() => {
    async function fetchWorkers() {
      try {
        const response = await fetch('/api/users');
        if (!response.ok) throw new Error('Failed to fetch workers');
        const data = await response.json();
        console.log('Workers data:', data);
        setWorkers(data);
      } catch (error) {
        console.error('Error fetching workers:', error);
      } finally {
        setLoading(prev => ({ ...prev, workers: false }));
      }
    }
    
    fetchWorkers();
  }, []);

  // Fetch stock data
  useEffect(() => {
    // Only fetch stock data if materials are loaded
    if (loading.materials) {
      console.log('Waiting for materials to load before fetching stock data...');
      return;
    }
    
    async function fetchStock() {
      try {
        setLoading(prev => ({ ...prev, stock: true }));
        console.log('Fetching stock data...');
        
        const url = materialFilter 
          ? `/api/stock?material_id=${materialFilter}` 
          : '/api/stock';
        
        console.log('Stock API URL:', url);
        const response = await fetch(url);
        console.log('Stock API response status:', response.status, response.statusText);
        
        if (!response.ok) throw new Error(`Failed to fetch stock data: ${response.status} ${response.statusText}`);
        
        const data = await response.json();
        console.log('Stock data received:', data);
        console.log('Stock data type:', typeof data);
        console.log('Stock data keys:', Object.keys(data));
        
        // Check if we got a no-data response
        if (data.noData) {
          console.log('No stock data available for this material');
          setStockData({ noData: true, message: data.message });
          // Clear any previous no-data message
          setNoDataMessages(prev => ({ ...prev, stock: data.message }));
        } 
        // Ensure we have a valid object
        else if (data && typeof data === 'object') {
          // Transform stock data to use proper material names
          const transformedStockData = {};
          
          // Debug materials array
          console.log('Materials available for mapping:', materials.map(m => ({
            id: m._id,
            material_id: m.material_id,
            name: m.name || m.material
          })));
          
          // Process each material in the stock data
          Object.entries(data).forEach(([key, value]) => {
            console.log(`Processing stock item: ${key} = ${value}`);
            
            // If the key starts with "Material ", try to replace it with a proper name
            if (key.startsWith("Material ")) {
              const materialId = key.replace("Material ", "");
              console.log(`Looking for material with ID: ${materialId}`);
              
              // Debug: try different matching methods
              const exactMatch = materials.find(m => m._id === materialId);
              const stringMatch = materials.find(m => m._id.toString() === materialId);
              const materialIdMatch = materials.find(m => m.material_id === materialId);
              const stringMaterialIdMatch = materials.find(m => 
                m.material_id && m.material_id.toString() === materialId
              );
              
              console.log('Match results:', {
                exactMatch: !!exactMatch,
                stringMatch: !!stringMatch,
                materialIdMatch: !!materialIdMatch,
                stringMaterialIdMatch: !!stringMaterialIdMatch
              });
              
              const material = exactMatch || stringMatch || materialIdMatch || stringMaterialIdMatch;
              
              if (material) {
                const materialName = material.name || material.material;
                console.log(`✅ Found material match: ${materialId} -> ${materialName}`);
                // Use the proper material name as the key
                transformedStockData[materialName] = value;
              } else {
                console.log(`❌ No material match found for: ${materialId}`);
                // Keep original if no match found
                transformedStockData[key] = value;
              }
            } else {
              // Keep keys that don't match the "Material X" pattern
              transformedStockData[key] = value;
            }
          });
          
          console.log('Transformed stock data:', transformedStockData);
          setStockData(transformedStockData);
          
          // Clear any previous no-data message
          setNoDataMessages(prev => ({ ...prev, stock: null }));
        } else {
          console.error('Stock data is not a valid object:', data);
          setStockData({});
        }
      } catch (error) {
        console.error('Error fetching stock:', error);
        setStockData({});
      } finally {
        setLoading(prev => ({ ...prev, stock: false }));
        console.log('Stock loading set to false');
      }
    }
    
    fetchStock();
  }, [materialFilter, materials, loading.materials]);

  // Fetch earnings data
  useEffect(() => {
    async function fetchEarnings() {
      try {
        setLoading(prev => ({ ...prev, earnings: true }));
        let url = `/api/earnings-comparison?period_type=${periodFilter}`;
        
        if (materialFilter) {
          url += `&material_id=${materialFilter}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch earnings data');
        const data = await response.json();
        console.log('Earnings data:', data);
        
        // Check if we got a no-data response
        if (data.noData) {
          setEarningsData([]);
          // Store the message to display on the chart
          setNoDataMessages(prev => ({ ...prev, earnings: data.message }));
        } else {
          setEarningsData(data);
          // Clear any previous no-data message
          setNoDataMessages(prev => ({ ...prev, earnings: null }));
        }
      } catch (error) {
        console.error('Error fetching earnings:', error);
      } finally {
        setLoading(prev => ({ ...prev, earnings: false }));
      }
    }
    
    fetchEarnings();
  }, [materialFilter, periodFilter]);

  // Fetch worker collections
  useEffect(() => {
    async function fetchWorkerCollections() {
      try {
        setLoading(prev => ({ ...prev, workerCollections: true }));
        let url = `/api/worker-collections?period_type=${periodFilter}`;
        
        if (workerFilter) {
          url += `&worker_id=${workerFilter}`;
        }
        
        if (materialFilter) {
          url += `&material_id=${materialFilter}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch worker collections');
        const data = await response.json();
        console.log('Worker collections data:', data);
        
        // Check if we got a no-data response
        if (data.noData) {
          setWorkerCollections({ grouped: false, data: [] });
          // Store the message to display on the chart
          setNoDataMessages(prev => ({ ...prev, workerCollections: data.message }));
        } else {
          setWorkerCollections(data);
          // Clear any previous no-data message
          setNoDataMessages(prev => ({ ...prev, workerCollections: null }));
        }
      } catch (error) {
        console.error('Error fetching worker collections:', error);
      } finally {
        setLoading(prev => ({ ...prev, workerCollections: false }));
      }
    }
    
    fetchWorkerCollections();
  }, [workerFilter, materialFilter, periodFilter]);

  // Fetch price fluctuation data
  useEffect(() => {
    async function fetchPriceFluctuation() {
      try {
        setLoading(prev => ({ ...prev, priceFluctuation: true }));
        const url = materialFilter 
          ? `/api/price-fluctuation?material_id=${materialFilter}` 
          : '/api/price-fluctuation';
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch price fluctuation');
        const data = await response.json();
        console.log('Price fluctuation data:', data);
        
        // Check if we got a no-data response
        if (data.noData) {
          setPriceFluctuationData({});
          // Store the message to display on the chart
          setNoDataMessages(prev => ({ ...prev, priceFluctuation: data.message }));
        } else {
          setPriceFluctuationData(data);
          // Clear any previous no-data message
          setNoDataMessages(prev => ({ ...prev, priceFluctuation: null }));
        }
      } catch (error) {
        console.error('Error fetching price fluctuation:', error);
      } finally {
        setLoading(prev => ({ ...prev, priceFluctuation: false }));
      }
    }
    
    fetchPriceFluctuation();
  }, [materialFilter]);

  // Fetch birthdays
  useEffect(() => {
    async function fetchBirthdays() {
      try {
        const response = await fetch('/api/birthdays');
        if (!response.ok) throw new Error('Failed to fetch birthdays');
        const data = await response.json();
        console.log('Birthdays data:', data);
        setBirthdays(data);
      } catch (error) {
        console.error('Error fetching birthdays:', error);
      } finally {
        setLoading(prev => ({ ...prev, birthdays: false }));
      }
    }
    
    fetchBirthdays();
  }, []);

  // Handle filter changes
  const handleMaterialFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMaterialFilter(e.target.value);
  };

  const handleWorkerFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setWorkerFilter(e.target.value);
  };

  const handlePeriodFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPeriodFilter(e.target.value);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(value);
  };

  const formatWeight = (value: number | any): string => {
    // Handle non-number values to prevent "toFixed is not a function" error
    if (value === null || value === undefined || typeof value !== 'number') {
      return '0.00';
    }
    return value.toFixed(2);
  };

  // Prepare chart data with proper material names
  const stockChartData = useMemo(() => {
    // Return empty data if we have a noData indicator
    if (!stockData || typeof stockData !== 'object') {
      return {
        labels: [],
        datasets: [{ data: [], backgroundColor: [], borderColor: '#fff', borderWidth: 1 }]
      };
    }
    
    if (stockData.noData) {
      return {
        labels: [],
        datasets: [{ data: [], backgroundColor: [], borderColor: '#fff', borderWidth: 1 }]
      };
    }
    
    try {
      // Direct fix: Map Material IDs to proper names from our materials array
      const materialNameMap: MaterialNameMap = {};
      materials.forEach(material => {
        const id = material._id?.toString() || '';
        materialNameMap[`Material ${id}`] = material.name || material.material || `Material ${id}`;
      });
      
      // Transform labels to use proper material names
      const labels = Object.keys(stockData).map(key => {
        // If this is a "Material X" format key, try to substitute with actual name
        if (key.startsWith('Material ')) {
          return materialNameMap[key] || key;
        }
        return key;
      });
      
      // Values should be in the same order as the transformed labels
      const values = labels.map(label => {
        // Find the original key that maps to this label
        const originalKey = Object.keys(stockData).find(key => {
          if (key === label) return true;
          if (key.startsWith('Material ') && materialNameMap[key] === label) return true;
          return false;
        });
        
        return originalKey && typeof stockData[originalKey] === 'number' ? stockData[originalKey] : 0;
      });
      
      // Log the chart data
      console.log('Prepared stock chart data:', { 
        originalLabels: Object.keys(stockData),
        transformedLabels: labels, 
        values 
      });
      
      return {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: [
              '#C74B6F', '#8A2736', '#5C1D2E', '#2D0D17', '#F7E4E4',
              '#A23B5F', '#7A1726', '#4C0D1E', '#1D0007', '#E7D4D4',
            ],
            borderColor: '#fff',
            borderWidth: 1,
          },
        ],
      };
    } catch (error) {
      console.error("Error preparing stock chart data:", error);
      // Return empty data in case of error
      return {
        labels: [],
        datasets: [{ data: [], backgroundColor: [], borderColor: '#fff', borderWidth: 1 }]
      };
    }
  }, [stockData, materials]);

  // Get period label based on period type
  const getPeriodTypeLabel = () => {
    switch (periodFilter) {
      case 'weekly':
        return 'Semanal';
      case 'yearly':
        return 'Anual';
      case 'monthly':
      default:
        return 'Mensal';
    }
  };

  // For material color scales in stacked bar chart
  const getMaterialColors = () => {
    return [
      '#C74B6F', '#8A2736', '#5C1D2E', '#2D0D17', '#F7E4E4',
      '#A23B5F', '#7A1726', '#4C0D1E', '#1D0007', '#E7D4D4',
    ];
  };

  // DEBUG: Output all state values
  console.log('DEBUG STATE:', {
    materials,
    workers,
    stockData,
    earningsData,
    workerCollections,
    priceFluctuationData,
    birthdays,
    loading,
    totalMaterials,
    totalWorkers,
    totalStock,
    currentMonthEarnings
  });

  return (
    <Layout activePath="/">
      {/* Welcome Banner */}
      {user && (
        <div className="mb-8 bg-white rounded-xl shadow-lg p-6 border-l-4 border-[#c15079]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <h2 className="text-xl font-bold text-[#7a1c44]">
                Bem-vindo ao Dashboard, {user.notFound ? 'Erro ao buscar usuário' : 'Carlos Ferreira'}!
              </h2>
              <p className="text-gray-600 mt-1 flex items-center">
                <FaCalendarAlt className="mr-2 text-[#c15079]" />
                {currentDate}
              </p>
            </div>
            <div className="mt-4 md:mt-0 bg-[#f8eef1] rounded-lg px-4 py-2">
              <p className="text-sm text-[#7a1c44]">Último acesso: {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </div>
      )}
      
      <h2 className="text-3xl font-bold text-dms-primary mb-6">
        Dashboard de Coleta de Materiais
      </h2>
      
      {/* Filters Section */}
      <div className="bg-white p-5 rounded-xl shadow-md mb-8">
        <h3 className="text-xl font-semibold text-dms-primary mb-4 flex items-center">
          <FaFilter className="mr-2 text-dms-secondary" />Filtros
        </h3>
        <div className="grid md:grid-cols-3 gap-x-6 gap-y-4">
          <div>
            <label htmlFor="materialFilterNext" className="block text-sm font-semibold text-dms-primary mb-1.5">Material</label>
            <select 
              id="materialFilterNext" 
              className="w-full py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm focus:border-dms-secondary focus:ring-2 focus:ring-dms-secondary focus:ring-opacity-25 transition-colors duration-150"
              value={materialFilter}
              onChange={handleMaterialFilterChange}
            >
              <option value="">Todos os Materiais</option>
              {materials.map((material) => (
                <option key={material.material_id || material._id} value={material.material_id || material._id}>
                  {material.name || material.material || `Material ${material.material_id || material._id}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="workerFilterNext" className="block text-sm font-semibold text-dms-primary mb-1.5">Trabalhador</label>
            <select 
              id="workerFilterNext" 
              className="w-full py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm focus:border-dms-secondary focus:ring-2 focus:ring-dms-secondary focus:ring-opacity-25 transition-colors duration-150"
              value={workerFilter}
              onChange={handleWorkerFilterChange}
            >
              <option value="">Todos os Trabalhadores</option>
              {workers.map((worker) => (
                <option key={worker.wastepicker_id} value={worker.wastepicker_id}>
                  {worker.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="periodFilterNext" className="block text-sm font-semibold text-dms-primary mb-1.5">Período</label>
            <select 
              id="periodFilterNext" 
              className="w-full py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm focus:border-dms-secondary focus:ring-2 focus:ring-dms-secondary focus:ring-opacity-25 transition-colors duration-150"
              value={periodFilter}
              onChange={handlePeriodFilterChange}
            >
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[ 
          { title: 'Materiais', value: loading.materials ? '-' : totalMaterials, iconName: 'FaBoxes', labelKey: 'totalMaterials' },
          { title: 'Trabalhadores', value: loading.workers ? '-' : totalWorkers, iconName: 'FaUsers', labelKey: 'totalWorkers' },
          { title: 'Estoque Total (kg)', value: loading.stock ? '-' : formatWeight(totalStock), iconName: 'FaWeightHanging', labelKey: 'totalStock' },
          { title: 'Ganhos Mensais', value: loading.earnings ? '-' : formatCurrency(currentMonthEarnings), iconName: 'FaDollarSign', labelKey: 'totalEarnings' },
        ].map(stat => {
          const IconComponent = iconComponents[stat.iconName];
          return (
            <div key={stat.title} className="bg-white p-6 rounded-xl shadow-lg text-center flex flex-col items-center">
              <div className="text-dms-secondary text-4xl mb-4">
                {IconComponent && <IconComponent />}
              </div> 
              <p id={stat.labelKey} className="text-3xl font-bold text-dms-primary mb-1">{stat.value}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{stat.title}</p>
            </div>
          );
        })}
      </div>
      
      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Estoque Atual Chart */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-semibold text-dms-primary mb-4 text-center lg:text-left">Estoque Atual</h3>
          <div className="h-72 bg-gray-50 rounded-lg border border-gray-300 p-4 flex items-center justify-center">
            {loading.stock ? (
              <div className="text-dms-secondary animate-spin text-2xl">
                <svg className="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : noDataMessages.stock ? (
              <p className="text-gray-400 italic">{noDataMessages.stock}</p>
            ) : Object.keys(stockData).length > 0 ? (
              <Doughnut 
                data={stockChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'right',
                      labels: {
                        boxWidth: 12,
                        font: {
                          size: 10
                        }
                      }
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          let label = context.label || '';
                          
                          if (label) {
                            label += ': ';
                          }
                          if (context.parsed !== undefined) {
                            label += formatWeight(context.parsed) + ' kg';
                          }
                          return label;
                        }
                      }
                    }
                  }
                }}
              />
            ) : (
              <p className="text-gray-400 italic">Nenhum estoque disponível</p>
            )}
          </div>
        </div>

        {/* Ganhos Chart */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-semibold text-dms-primary mb-4 text-center lg:text-left">
            Ganhos {getPeriodTypeLabel()}
          </h3>
          <div className="h-72 bg-gray-50 rounded-lg border border-gray-300 p-4 flex items-center justify-center">
            {loading.earnings ? (
              <div className="text-dms-secondary animate-spin text-2xl">
                <svg className="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : noDataMessages.earnings ? (
              <p className="text-gray-400 italic">{noDataMessages.earnings}</p>
            ) : earningsData.length > 0 ? (
              <Line
                data={{
                  labels: earningsData.map(item => item.period),
                  datasets: [
                    {
                      label: 'Ganhos (R$)',
                      data: earningsData.map(item => item.earnings),
                      borderColor: '#C74B6F',
                      backgroundColor: 'rgba(199, 75, 111, 0.1)',
                      fill: true,
                      tension: 0.4,
                      pointBackgroundColor: '#8A2736',
                      pointBorderColor: '#fff',
                      pointBorderWidth: 2,
                      pointRadius: 4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: function(value) {
                          return formatCurrency(Number(value));
                        }
                      }
                    }
                  },
                  plugins: {
                    legend: {
                      display: false
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          return formatCurrency(context.parsed.y);
                        }
                      }
                    }
                  }
                }}
              />
            ) : (
              <p className="text-gray-400 italic">Nenhum dado de ganhos disponível</p>
            )}
          </div>
        </div>

        {/* Coletas de Trabalhadores Chart */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-semibold text-dms-primary mb-4 text-center lg:text-left">
            Coletas de Trabalhadores {getPeriodTypeLabel()}
          </h3>
          <div className="h-72 bg-gray-50 rounded-lg border border-gray-300 p-4 flex items-center justify-center">
            {loading.workerCollections ? (
              <div className="text-dms-secondary animate-spin text-2xl">
                <svg className="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : noDataMessages.workerCollections ? (
              <p className="text-gray-400 italic">{noDataMessages.workerCollections}</p>
            ) : workerCollections.grouped && periodFilter === 'yearly' && !materialFilter ? (
              // Display stacked bar chart for yearly data
              <Bar
                data={{
                  labels: workerCollections.workers.map((worker: any) => worker.worker_name),
                  datasets: workerCollections.materials.map((material: any, index: number) => {
                    console.log(`Material ${index}:`, material);
                    return {
                      label: material.name,
                      data: workerCollections.workers.map((worker: any) => worker[material.id] || 0),
                      backgroundColor: getMaterialColors()[index % getMaterialColors().length],
                      borderColor: 'rgba(255, 255, 255, 0.5)',
                      borderWidth: 0.5,
                      stack: 'Stack 0',
                    };
                  }),
                }}
                options={{
                  indexAxis: 'y', // Horizontal bar chart
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: {
                      stacked: true,
                      beginAtZero: true,
                      ticks: {
                        callback: function(value) {
                          return value + ' kg';
                        }
                      }
                    },
                    y: {
                      stacked: true
                    }
                  },
                  plugins: {
                    legend: {
                      position: 'top',
                      labels: {
                        boxWidth: 12,
                        font: {
                          size: 10
                        }
                      }
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          const materialName = context.dataset.label;
                          const weight = formatWeight(context.raw as number);
                          return `${materialName}: ${weight} kg`;
                        }
                      }
                    }
                  }
                }}
              />
            ) : workerCollections.data && workerCollections.data.length > 0 ? (
              // Display regular bar chart for other data
              <Bar
                data={{
                  labels: workerCollections.data.map((worker: any) => worker.worker_name),
                  datasets: [
                    {
                      label: 'Peso Coletado (kg)',
                      data: workerCollections.data.map((worker: any) => worker.totalWeight),
                      backgroundColor: '#8A2736',
                      borderColor: 'rgba(138, 39, 54, 0.7)',
                      borderWidth: 1,
                    },
                  ],
                }}
                options={{
                  indexAxis: 'y', // Horizontal bar chart
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: {
                      beginAtZero: true,
                      ticks: {
                        callback: function(value) {
                          return value + ' kg';
                        }
                      }
                    }
                  },
                  plugins: {
                    legend: {
                      display: false
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          return formatWeight(context.raw as number) + ' kg';
                        }
                      }
                    }
                  }
                }}
              />
            ) : (
              <p className="text-gray-400 italic">Nenhuma coleta de trabalhador disponível</p>
            )}
          </div>
        </div>

        {/* Flutuação de Preços Chart */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-semibold text-dms-primary mb-4 text-center lg:text-left">Flutuação de Preços</h3>
          <div className="h-72 bg-gray-50 rounded-lg border border-gray-300 p-4 flex items-center justify-center">
            {loading.priceFluctuation ? (
              <div className="text-dms-secondary animate-spin text-2xl">
                <svg className="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : noDataMessages.priceFluctuation ? (
              <p className="text-gray-400 italic">{noDataMessages.priceFluctuation}</p>
            ) : !materialFilter ? (
              <div className="text-center p-4">
                <p className="text-gray-500 mb-3">Selecione um material específico para visualizar a flutuação de preços.</p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {materials.slice(0, 5).map((material) => (
                    <button 
                      key={material.material_id || material._id}
                      onClick={() => setMaterialFilter(material.material_id?.toString() || material._id?.toString() || '')}
                      className="px-3 py-2 bg-dms-secondary text-white rounded-md hover:bg-dms-primary transition-colors duration-200"
                    >
                      {material.name || material.material || `Material ${material.material_id || material._id}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : priceFluctuationData.materials && priceFluctuationData.priceData ? (
              <Line
                data={{
                  // Use the properly formatted weekLabel from the API
                  labels: priceFluctuationData.priceData.map((week: any) => week.weekLabel),
                  datasets: priceFluctuationData.materials.map((material: string, index: number) => ({
                    label: material,
                    data: priceFluctuationData.priceData.map((week: any) => week.materials[material] || null),
                    borderColor: [
                      '#C74B6F', '#8A2736', '#5C1D2E', '#2D0D17', '#F7E4E4',
                    ][index % 5],
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointBackgroundColor: [
                      '#C74B6F', '#8A2736', '#5C1D2E', '#2D0D17', '#F7E4E4',
                    ][index % 5],
                    pointBorderColor: '#fff',
                    pointRadius: 3,
                    tension: 0.1,
                  }))
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: false,
                      ticks: {
                        callback: function(value) {
                          return formatCurrency(Number(value));
                        }
                      }
                    },
                    x: {
                      ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: {
                          size: 10
                        },
                        autoSkip: false
                      }
                    }
                  },
                  plugins: {
                    legend: {
                      position: 'top',
                      labels: {
                        boxWidth: 12,
                        font: {
                          size: 10
                        }
                      }
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          let label = context.dataset.label || '';
                          if (label) {
                            label += ': ';
                          }
                          if (context.parsed.y !== null) {
                            label += formatCurrency(context.parsed.y);
                          }
                          return label;
                        }
                      }
                    }
                  }
                }}
              />
            ) : Array.isArray(priceFluctuationData) && priceFluctuationData.length > 0 ? (
              <Line
                data={{
                  // Use the properly formatted dateLabel from the API
                  labels: priceFluctuationData.map((item: any) => item.dateLabel || `S${item.week}`),
                  datasets: [
                    {
                      // Use the material name directly from the API response
                      label: priceFluctuationData[0].material || 'Preço do Material',
                      data: priceFluctuationData.map((item: any) => item.price),
                      borderColor: '#C74B6F',
                      backgroundColor: 'transparent',
                      borderWidth: 2,
                      pointBackgroundColor: '#C74B6F',
                      pointBorderColor: '#fff',
                      pointRadius: 3,
                      tension: 0.1,
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: false,
                      ticks: {
                        callback: function(value) {
                          return formatCurrency(Number(value));
                        }
                      }
                    },
                    x: {
                      ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: {
                          size: 10
                        },
                        autoSkip: false
                      }
                    }
                  },
                  plugins: {
                    legend: {
                      position: 'top',
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          let label = context.dataset.label || '';
                          if (label) {
                            label += ': ';
                          }
                          if (context.parsed.y !== null) {
                            label += formatCurrency(context.parsed.y);
                          }
                          return label;
                        }
                      }
                    }
                  }
                }}
              />
            ) : (
              <p className="text-gray-400 italic">Nenhum dado de flutuação de preços disponível</p>
            )}
          </div>
        </div>
      </div>

       {/* Birthdays Section */}
       <div className="bg-white p-6 rounded-xl shadow-lg">
        <h3 className="text-xl font-semibold text-dms-primary mb-4 flex items-center">
          <FaBirthdayCake className="mr-2 text-dms-secondary" />Aniversários do Mês
        </h3>
        <div id="birthdaysListNext" className="space-y-3">
          {loading.birthdays ? (
            <div className="flex justify-center p-4">
              <div className="text-dms-secondary animate-spin text-xl">
                <svg className="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            </div>
          ) : birthdays && birthdays.length > 0 ? (
            birthdays.map((birthday, index) => (
              <div 
                key={index} 
                className="bg-dms-light-gray p-4 rounded-lg border-l-4 border-dms-accent shadow-sm hover:translate-x-1.5 transition-transform duration-200 ease-in-out cursor-pointer"
              >
                <p className="font-semibold text-dms-primary text-md">{birthday.name}</p>
                <p className="text-sm text-dms-text">Data: {birthday.date}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 italic">Não há aniversariantes no mês corrente.</p>
          )}
        </div>
      </div>
    </Layout>
  );
}
