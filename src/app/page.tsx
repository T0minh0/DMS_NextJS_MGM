"use client";

import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/Layout'; // Assuming @ is configured for src
import { FaFilter, FaBirthdayCake, FaBoxes, FaUsers, FaWeightHanging, FaDollarSign, FaCalendarAlt, FaCog, FaIdCard, FaSpinner } from 'react-icons/fa'; // Added FaIdCard
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

const chartPalette = [
  '#00D4FF',
  '#FF00D4',
  '#00FF88',
  '#FFD700',
  '#FF6B35',
  '#94A3C7',
  '#65708D',
];

const chartTextColor = '#94A3C7';
const chartGridColor = '#2A3441';
const chartBorderColor = '#0A0E1A';

ChartJS.defaults.color = chartTextColor;
ChartJS.defaults.borderColor = chartGridColor;

const chartAxisBase = {
  ticks: {
    color: chartTextColor,
  },
  grid: {
    color: chartGridColor,
  },
  border: {
    color: chartGridColor,
  },
};

const chartLegendLabelsBase = {
  color: chartTextColor,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [materials, setMaterials] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [workers, setWorkers] = useState<any[]>([]);
  const [stockData, setStockData] = useState<StockDataItem>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [earningsData, setEarningsData] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [workerCollections, setWorkerCollections] = useState<any>({ grouped: false, data: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [priceFluctuationData, setPriceFluctuationData] = useState<any>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const [recalculating, setRecalculating] = useState(false);
  const [recalculationMessage, setRecalculationMessage] = useState<string | null>(null);
  const [assigningIds, setAssigningIds] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [debugging, setDebugging] = useState(false);
  const [debugMessage, setDebugMessage] = useState<string | null>(null);

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
    .filter(([, value]) => typeof value === 'number')
    .reduce((sum: number, [, value]) => sum + (value as number), 0);

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
          const transformedStockData: Record<string, number> = {};

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
                transformedStockData[materialName] = value as number;
              } else {
                console.log(`❌ No material match found for: ${materialId}`);
                // Keep original if no match found
                transformedStockData[key] = value as number;
              }
            } else {
              // Keep keys that don't match the "Material X" pattern
              transformedStockData[key] = value as number;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        datasets: [{ data: [], backgroundColor: [], borderColor: chartBorderColor, borderWidth: 1 }]
      };
    }

    if (stockData.noData) {
      return {
        labels: [],
        datasets: [{ data: [], backgroundColor: [], borderColor: chartBorderColor, borderWidth: 1 }]
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
            backgroundColor: chartPalette,
            borderColor: chartBorderColor,
            borderWidth: 1,
          },
        ],
      };
    } catch (error) {
      console.error("Error preparing stock chart data:", error);
      // Return empty data in case of error
      return {
        labels: [],
        datasets: [{ data: [], backgroundColor: [], borderColor: chartBorderColor, borderWidth: 1 }]
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
    return chartPalette;
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

  // Add recalculation function
  const handleRecalculateContributions = async () => {
    if (!user || user.userType !== 0) {
      alert('Apenas administradores podem executar o recálculo.');
      return;
    }

    if (!confirm('Tem certeza que deseja recalcular todas as contribuições? Isso pode levar alguns minutos.')) {
      return;
    }

    try {
      setRecalculating(true);
      setRecalculationMessage(null);

      const response = await fetch('/api/recalculate-contributions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        setRecalculationMessage(`✅ Recálculo concluído! Processados ${data.processed} registros. Total: ${data.statistics.totalWeight} kg e R$ ${data.statistics.totalEarnings.toFixed(2)}`);

        // Refresh the data on the dashboard
        window.location.reload();
      } else {
        setRecalculationMessage(`❌ Erro no recálculo: ${data.error}`);
      }
    } catch (error) {
      console.error('Error recalculating contributions:', error);
      setRecalculationMessage('❌ Erro ao recalcular contribuições. Tente novamente.');
    } finally {
      setRecalculating(false);
    }
  };

  // Add function to assign wastepicker_ids
  const handleAssignWastepickerIds = async () => {
    if (!user || user.userType !== 0) {
      alert('Apenas administradores podem executar esta operação.');
      return;
    }

    if (!confirm('Tem certeza que deseja atribuir IDs para catadores que não possuem? Esta operação é segura e não afeta dados existentes.')) {
      return;
    }

    try {
      setAssigningIds(true);
      setAssignmentMessage(null);

      const response = await fetch('/api/users/assign-wastepicker-ids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        if (data.updated > 0) {
          setAssignmentMessage(`✅ IDs atribuídos com sucesso! ${data.updated} catadores atualizados.`);

          // Refresh the workers data
          const fetchWorkers = async () => {
            try {
              const response = await fetch('/api/users');
              if (!response.ok) throw new Error('Failed to fetch workers');
              const data = await response.json();
              setWorkers(data);
            } catch (error) {
              console.error('Error fetching workers:', error);
            }
          };
          fetchWorkers();
        } else {
          setAssignmentMessage('ℹ️ Todos os catadores já possuem IDs atribuídos.');
        }
      } else {
        setAssignmentMessage(`❌ Erro na atribuição: ${data.error}`);
      }
    } catch (error) {
      console.error('Error assigning wastepicker IDs:', error);
      setAssignmentMessage('❌ Erro ao atribuir IDs. Tente novamente.');
    } finally {
      setAssigningIds(false);
    }
  };

  // Add debug function
  const handleDebugData = async () => {
    if (!user || user.userType !== 0) {
      alert('Apenas administradores podem executar esta operação.');
      return;
    }

    try {
      setDebugging(true);
      setDebugMessage(null);

      const response = await fetch('/api/debug/check-data');
      const data = await response.json();

      if (response.ok) {
        const summary = `🔍 DIAGNÓSTICO DOS DADOS:
📊 Catadores: ${data.workers.total} total, ${data.workers.withWastepickerId} com ID, ${data.workers.withoutWastepickerId} sem ID
📏 Medições: ${data.measurements.total} registros
💼 Contribuições: ${data.worker_contributions.total} registros calculados
🏷️ Materiais: ${data.materials.total} tipos

${data.workers.withoutWastepickerId > 0 ? '⚠️ AÇÃO NECESSÁRIA: Atribuir IDs aos catadores primeiro!' : ''}
${data.measurements.total === 0 ? '⚠️ PROBLEMA: Nenhuma medição encontrada!' : ''}
${data.worker_contributions.total === 0 ? '⚠️ PROBLEMA: Nenhuma contribuição calculada!' : ''}`;

        setDebugMessage(summary);
        console.log('Debug Data Full:', data);
      } else {
        setDebugMessage(`❌ Erro no diagnóstico: ${data.error}`);
      }
    } catch (error) {
      console.error('Error debugging data:', error);
      setDebugMessage('❌ Erro ao diagnosticar dados. Tente novamente.');
    } finally {
      setDebugging(false);
    }
  };

  return (
    <Layout activePath="/">
      {/* Welcome Banner */}
      {user && (
        <div className="surface-panel mb-8 rounded-xl border-l-4 border-primary p-6">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Bem-vindo ao Dashboard, {user.full_name || user.name || 'Usuário'}!
              </h2>
              <p className="mt-1 flex items-center text-text-secondary">
                <FaCalendarAlt className="mr-2 text-primary" />
                {currentDate}
              </p>
            </div>
            <div className="rounded-lg border border-outline bg-surface-alt px-4 py-2">
              <p className="text-sm text-text-secondary">Último acesso: {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </div>
      )}

      <h2 className="mb-6 text-3xl font-semibold text-primary">
        Dashboard de Coleta de Materiais
      </h2>

      {/* Filters Section */}
      <div className="surface-panel mb-8 rounded-xl p-5">
        <h3 className="mb-4 flex items-center text-xl font-semibold text-primary">
          <FaFilter className="mr-2 text-secondary" />Filtros
        </h3>
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-3">
          <div>
            <label htmlFor="materialFilterNext" className="mb-1.5 block text-sm font-semibold text-primary">Material</label>
            <select
              id="materialFilterNext"
              className="w-full rounded-lg border border-outline bg-surface px-4 py-2.5 text-foreground shadow-sm focus:border-primary focus:ring-0"
              value={materialFilter}
              onChange={handleMaterialFilterChange}
            >
              <option value="">Todos os Materiais</option>
              {/* Groups first */}
              {materials.filter(material => material.isGroup).map((material) => (
                <option
                  key={material.material_id || material._id}
                  value={material.material_id || material._id}
                  style={{ fontWeight: 'bold' }}
                >
                  📁 {material.name || material.material}
                </option>
              ))}
              {/* Separator if there are groups */}
              {materials.some(material => material.isGroup) && materials.some(material => !material.isGroup) && (
                <option key="separator" disabled style={{ color: '#65708D', fontSize: '12px' }}>
                  ──────────────────
                </option>
              )}
              {/* Individual materials */}
              {materials.filter(material => !material.isGroup).map((material) => (
                <option
                  key={material.material_id || material._id}
                  value={material.material_id || material._id}
                >
                  {material.name || material.material || `Material ${material.material_id || material._id}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="workerFilterNext" className="mb-1.5 block text-sm font-semibold text-primary">Trabalhador</label>
            <select
              id="workerFilterNext"
              className="w-full rounded-lg border border-outline bg-surface px-4 py-2.5 text-foreground shadow-sm focus:border-primary focus:ring-0"
              value={workerFilter}
              onChange={handleWorkerFilterChange}
            >
              <option value="">Todos os Trabalhadores</option>
              {workers.map((worker, index) => (
                <option
                  key={worker.wastepicker_id || worker._id || worker.id || `worker-${index}`}
                  value={worker.wastepicker_id || worker._id || worker.id}
                  disabled={!worker.wastepicker_id}
                >
                  {worker.full_name}{!worker.wastepicker_id ? ' (ID não atribuído)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="periodFilterNext" className="mb-1.5 block text-sm font-semibold text-primary">Período</label>
            <select
              id="periodFilterNext"
              className="w-full rounded-lg border border-outline bg-surface px-4 py-2.5 text-foreground shadow-sm focus:border-primary focus:ring-0"
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
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: 'Materiais', value: loading.materials ? '-' : totalMaterials, iconName: 'FaBoxes', labelKey: 'totalMaterials' },
          { title: 'Trabalhadores', value: loading.workers ? '-' : totalWorkers, iconName: 'FaUsers', labelKey: 'totalWorkers' },
          { title: 'Estoque Total (kg)', value: loading.stock ? '-' : formatWeight(totalStock), iconName: 'FaWeightHanging', labelKey: 'totalStock' },
          { title: `Ganho ${getPeriodTypeLabel()}`, value: loading.earnings ? '-' : formatCurrency(currentMonthEarnings), iconName: 'FaDollarSign', labelKey: 'totalEarnings' },
        ].map(stat => {
          const IconComponent = iconComponents[stat.iconName];
          return (
            <div key={stat.title} className="surface-panel flex flex-col items-center rounded-xl p-6 text-center">
              <div className="mb-4 text-4xl text-secondary">
                {IconComponent && <IconComponent />}
              </div>
              <p id={stat.labelKey} className="mb-1 text-3xl font-semibold text-primary">{stat.value}</p>
              <p className="text-xs font-medium uppercase text-text-secondary">{stat.title}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Estoque Atual Chart */}
        <div className="surface-panel rounded-xl p-6">
          <h3 className="mb-4 text-center text-xl font-semibold text-primary lg:text-left">Estoque Atual</h3>
          <div className="flex h-72 items-center justify-center rounded-lg border border-outline bg-background/55 p-4">
            {loading.stock ? (
              <FaSpinner className="h-8 w-8 animate-spin text-secondary" />
            ) : noDataMessages.stock ? (
              <p className="text-text-secondary italic">{noDataMessages.stock}</p>
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
                        ...chartLegendLabelsBase,
                        boxWidth: 12,
                        font: {
                          size: 10
                        }
                      }
                    },
                    tooltip: {
                      callbacks: {
                        label: function (context) {
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
              <p className="text-text-secondary italic">Nenhum estoque disponível</p>
            )}
          </div>
        </div>

        {/* Ganhos Chart */}
        <div className="surface-panel rounded-xl p-6">
          <h3 className="mb-4 text-center text-xl font-semibold text-primary lg:text-left">
            Ganhos {getPeriodTypeLabel()}
          </h3>
          <div className="flex h-72 items-center justify-center rounded-lg border border-outline bg-background/55 p-4">
            {loading.earnings ? (
              <FaSpinner className="h-8 w-8 animate-spin text-secondary" />
            ) : noDataMessages.earnings ? (
              <p className="text-text-secondary italic">{noDataMessages.earnings}</p>
            ) : earningsData.length > 0 ? (
              <Line
                data={{
                  labels: earningsData.map(item => item.period),
                  datasets: [
                    {
                      label: 'Ganhos (R$)',
                      data: earningsData.map(item => item.earnings),
                      borderColor: chartPalette[0],
                      backgroundColor: 'rgba(0, 212, 255, 0.14)',
                      fill: true,
                      tension: 0.4,
                      pointBackgroundColor: chartPalette[1],
                      pointBorderColor: chartBorderColor,
                      pointBorderWidth: 2,
                      pointRadius: 4,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    x: chartAxisBase,
                    y: {
                      ...chartAxisBase,
                      beginAtZero: true,
                      ticks: {
                        color: chartTextColor,
                        callback: function (value) {
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
                        label: function (context) {
                          return formatCurrency(context.parsed.y);
                        }
                      }
                    }
                  }
                }}
              />
            ) : (
              <p className="text-text-secondary italic">Nenhum dado de ganhos disponível</p>
            )}
          </div>
        </div>

        {/* Coletas de Trabalhadores Chart */}
        <div className="surface-panel rounded-xl p-6">
          <h3 className="mb-4 text-center text-xl font-semibold text-primary lg:text-left">
            Coletas de Trabalhadores {getPeriodTypeLabel()}
          </h3>
          <div className="flex h-72 items-center justify-center rounded-lg border border-outline bg-background/55 p-4">
            {loading.workerCollections ? (
              <FaSpinner className="h-8 w-8 animate-spin text-secondary" />
            ) : noDataMessages.workerCollections ? (
              <p className="text-text-secondary italic">{noDataMessages.workerCollections}</p>
            ) : workerCollections.grouped && periodFilter === 'yearly' && !materialFilter ? (
              // Display stacked bar chart for yearly data
              <Bar
                data={{
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  labels: workerCollections.workers.map((worker: any) => worker.worker_name),
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  datasets: workerCollections.materials.map((material: any, index: number) => {
                    console.log(`Material ${index}:`, material);
                    return {
                      label: material.name,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      data: workerCollections.workers.map((worker: any) => worker[material.id] || 0),
                      backgroundColor: getMaterialColors()[index % getMaterialColors().length],
                      borderColor: chartBorderColor,
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
                      ...chartAxisBase,
                      stacked: true,
                      beginAtZero: true,
                      ticks: {
                        color: chartTextColor,
                        callback: function (value) {
                          return value + ' kg';
                        }
                      }
                    },
                    y: {
                      ...chartAxisBase,
                      stacked: true
                    }
                  },
                  plugins: {
                    legend: {
                      position: 'top',
                      labels: {
                        ...chartLegendLabelsBase,
                        boxWidth: 12,
                        font: {
                          size: 10
                        }
                      }
                    },
                    tooltip: {
                      callbacks: {
                        label: function (context) {
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  labels: workerCollections.data.map((worker: any) => worker.worker_name),
                  datasets: [
                    {
                      label: 'Peso Coletado (kg)',
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      data: workerCollections.data.map((worker: any) => worker.totalWeight),
                      backgroundColor: chartPalette[1],
                      borderColor: chartBorderColor,
                      borderWidth: 1,
                    },
                  ],
                }}
                options={{
                  indexAxis: 'y', // Horizontal bar chart
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: chartAxisBase,
                    x: {
                      ...chartAxisBase,
                      beginAtZero: true,
                      ticks: {
                        color: chartTextColor,
                        callback: function (value) {
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
                        label: function (context) {
                          return formatWeight(context.raw as number) + ' kg';
                        }
                      }
                    }
                  }
                }}
              />
            ) : (
              <p className="text-text-secondary italic">Nenhuma coleta de trabalhador disponível</p>
            )}
          </div>
        </div>

        {/* Flutuação de Preços Chart */}
        <div className="surface-panel rounded-xl p-6">
          <h3 className="mb-4 text-center text-xl font-semibold text-primary lg:text-left">Flutuação de Preços</h3>
          <div className="flex h-72 items-center justify-center rounded-lg border border-outline bg-background/55 p-4">
            {loading.priceFluctuation ? (
              <FaSpinner className="h-8 w-8 animate-spin text-secondary" />
            ) : noDataMessages.priceFluctuation ? (
              <p className="text-text-secondary italic">{noDataMessages.priceFluctuation}</p>
            ) : !materialFilter ? (
              <div className="text-center p-4">
                <p className="mb-3 text-text-secondary">Selecione um material específico para visualizar a flutuação de preços.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {materials.slice(0, 5).map((material) => (
                    <button
                      key={material.material_id || material._id}
                      onClick={() => setMaterialFilter(material.material_id?.toString() || material._id?.toString() || '')}
                      className="rounded-md bg-secondary px-3 py-2 text-background transition-colors duration-200 hover:bg-primary"
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  labels: priceFluctuationData.priceData.map((week: any) => week.weekLabel),
                  datasets: priceFluctuationData.materials.map((material: string, index: number) => ({
                    label: material,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    data: priceFluctuationData.priceData.map((week: any) => week.materials[material] || null),
                    borderColor: chartPalette[index % chartPalette.length],
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointBackgroundColor: chartPalette[index % chartPalette.length],
                    pointBorderColor: chartBorderColor,
                    pointRadius: 3,
                    tension: 0.1,
                  }))
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      ...chartAxisBase,
                      beginAtZero: false,
                      ticks: {
                        color: chartTextColor,
                        callback: function (value) {
                          return formatCurrency(Number(value));
                        }
                      }
                    },
                    x: {
                      ...chartAxisBase,
                      ticks: {
                        color: chartTextColor,
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
                        ...chartLegendLabelsBase,
                        boxWidth: 12,
                        font: {
                          size: 10
                        }
                      }
                    },
                    tooltip: {
                      callbacks: {
                        label: function (context) {
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
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  labels: priceFluctuationData.map((item: any) => item.dateLabel || `S${item.week}`),
                  datasets: [
                    {
                      // Use the material name directly from the API response
                      label: priceFluctuationData[0].material || 'Preço do Material',
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      data: priceFluctuationData.map((item: any) => item.price),
                      borderColor: chartPalette[0],
                      backgroundColor: 'transparent',
                      borderWidth: 2,
                      pointBackgroundColor: chartPalette[0],
                      pointBorderColor: chartBorderColor,
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
                      ...chartAxisBase,
                      beginAtZero: false,
                      ticks: {
                        color: chartTextColor,
                        callback: function (value) {
                          return formatCurrency(Number(value));
                        }
                      }
                    },
                    x: {
                      ...chartAxisBase,
                      ticks: {
                        color: chartTextColor,
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
                      labels: chartLegendLabelsBase,
                    },
                    tooltip: {
                      callbacks: {
                        label: function (context) {
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
              <p className="text-text-secondary italic">Nenhum dado de flutuação de preços disponível</p>
            )}
          </div>
        </div>
      </div>

      {/* Birthdays Section */}
      <div className="surface-panel rounded-xl p-6">
        <h3 className="mb-4 flex items-center text-xl font-semibold text-primary">
          <FaBirthdayCake className="mr-2 text-secondary" />Aniversários do Mês
        </h3>
        <div id="birthdaysListNext" className="space-y-3">
          {loading.birthdays ? (
            <div className="flex justify-center p-4 text-secondary">
              <FaSpinner className="h-6 w-6 animate-spin" />
            </div>
          ) : birthdays && birthdays.length > 0 ? (
            birthdays.map((birthday, index) => (
              <div
                key={index}
                className="cursor-pointer rounded-lg border-l-4 border-warning bg-surface-alt p-4 shadow-sm transition-transform duration-200 ease-in-out hover:translate-x-1.5"
              >
                <p className="text-md font-semibold text-primary">{birthday.name}</p>
                <p className="text-sm text-foreground">Data: {birthday.date}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-text-secondary italic">Não há aniversariantes no mês corrente.</p>
          )}
        </div>
      </div>

      {/* Admin Tools Section - Only show for administrators */}
      {user && user.userType === 0 && (
        <div className="surface-panel rounded-xl border-l-4 border-warning p-6">
          <h3 className="mb-4 flex items-center text-xl font-semibold text-warning">
            <FaCog className="mr-2 text-warning" />
            Ferramentas de Administração
          </h3>
          <div className="space-y-6">
            {/* Recalculate Contributions */}
            <div>
              <p className="mb-3 text-text-secondary">
                Recalcular todas as contribuições dos trabalhadores baseado nas medições.
                Isso corrige problemas de dupla contagem e atualiza os dados automaticamente.
              </p>
              <button
                onClick={handleRecalculateContributions}
                disabled={recalculating}
                className={`mr-4 rounded-lg px-6 py-3 font-semibold transition-colors duration-200 ${recalculating
                  ? 'cursor-not-allowed bg-surface-alt text-text-secondary'
                  : 'bg-warning text-background hover:bg-warning/90'
                  }`}
              >
                {recalculating ? (
                  <span className="flex items-center">
                    <FaSpinner className="mr-3 h-5 w-5 animate-spin" />
                    Recalculando...
                  </span>
                ) : (
                  'Recalcular Contribuições'
                )}
              </button>
              {recalculationMessage && (
                <div className={`p-4 rounded-lg mt-3 ${recalculationMessage.startsWith('✅')
                  ? 'border border-success/35 bg-success/12 text-foreground'
                  : 'border border-error/35 bg-error/12 text-foreground'
                  }`}>
                  {recalculationMessage}
                </div>
              )}
            </div>

            {/* Assign Wastepicker IDs */}
            <div className="border-t border-outline pt-6">
              <p className="mb-3 text-text-secondary">
                Atribuir IDs únicos (WP001, WP002, etc.) para catadores que ainda não possuem.
                Necessário para rastreamento de produtividade e contribuições.
              </p>
              <button
                onClick={handleAssignWastepickerIds}
                disabled={assigningIds}
                className={`rounded-lg px-6 py-3 font-semibold transition-colors duration-200 ${assigningIds
                  ? 'cursor-not-allowed bg-surface-alt text-text-secondary'
                  : 'bg-primary text-background hover:bg-primary/90'
                  }`}
              >
                {assigningIds ? (
                  <span className="flex items-center">
                    <FaSpinner className="mr-3 h-5 w-5 animate-spin" />
                    Atribuindo IDs...
                  </span>
                ) : (
                  <span className="flex items-center">
                    <FaIdCard className="mr-2" />
                    Atribuir IDs aos Catadores
                  </span>
                )}
              </button>
              {assignmentMessage && (
                <div className={`p-4 rounded-lg mt-3 ${assignmentMessage.startsWith('✅') || assignmentMessage.startsWith('ℹ️')
                  ? 'border border-success/35 bg-success/12 text-foreground'
                  : 'border border-error/35 bg-error/12 text-foreground'
                  }`}>
                  {assignmentMessage}
                </div>
              )}
            </div>

            {/* Debug Data */}
            <div className="border-t border-outline pt-6">
              <p className="mb-3 text-text-secondary">
                Verificar o estado atual dos dados para ajudar a solucionar problemas.
              </p>
              <button
                onClick={handleDebugData}
                disabled={debugging}
                className={`rounded-lg px-6 py-3 font-semibold transition-colors duration-200 ${debugging
                  ? 'cursor-not-allowed bg-surface-alt text-text-secondary'
                  : 'bg-secondary text-background hover:bg-secondary/90'
                  }`}
              >
                {debugging ? (
                  <span className="flex items-center">
                    <FaSpinner className="mr-3 h-5 w-5 animate-spin" />
                    Verificando...
                  </span>
                ) : (
                  'Verificar Dados'
                )}
              </button>
              {debugMessage && (
                <div className={`p-4 rounded-lg mt-3 ${debugMessage.startsWith('🔍')
                  ? 'border border-success/35 bg-success/12 text-foreground'
                  : 'border border-error/35 bg-error/12 text-foreground'
                  }`}>
                  {debugMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
