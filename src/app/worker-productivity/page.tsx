"use client";

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { FaUser, FaCalendarWeek, FaWeightHanging, FaTrophy, FaChartLine, FaFilter } from 'react-icons/fa';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface Worker {
  wastepicker_id: string;
  full_name: string;
  user_id?: string;
}



interface WeeklyContribution {
  week: string;
  weekStart: string;
  weekEnd: string;
  materials: {
    [materialId: string]: {
      materialName: string;
      weight: number;
      measurements: Array<{
        date: string;
        weight: number;
        bag_filled: string;
        timestamp: string;
      }>;
    };
  };
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

export default function WorkerProductivityPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [weeklyContributions, setWeeklyContributions] = useState<WeeklyContribution[]>([]);
  const [productivityStats, setProductivityStats] = useState<ProductivityStats | null>(null);
  const [loading, setLoading] = useState({
    workers: true,
    materials: true,
    contributions: false,
  });
  const [selectedPeriod, setSelectedPeriod] = useState<number>(12); // Last 12 weeks

  useEffect(() => {
    fetchWorkers();
  }, []);

  useEffect(() => {
    const loadContributions = async () => {
      if (selectedWorkerId) {
        const worker = workers.find(w => w.wastepicker_id === selectedWorkerId);
        setSelectedWorker(worker || null);
        try {
          setLoading(prev => ({ ...prev, contributions: true }));
          const response = await fetch(`/api/worker-productivity?worker_id=${selectedWorkerId}&weeks=${selectedPeriod}`);
          if (!response.ok) throw new Error('Failed to fetch worker contributions');
          const data = await response.json();

          setWeeklyContributions(data.weeklyContributions || []);
          setProductivityStats(data.stats || null);
        } catch (error) {
          console.error('Error fetching worker contributions:', error);
          setWeeklyContributions([]);
          setProductivityStats(null);
        } finally {
          setLoading(prev => ({ ...prev, contributions: false }));
        }
      } else {
        setSelectedWorker(null);
        setWeeklyContributions([]);
        setProductivityStats(null);
      }
    };

    loadContributions();
  }, [selectedWorkerId, selectedPeriod, workers]);

  const fetchWorkers = async () => {
    try {
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch workers');
      const data = await response.json();
      setWorkers(data);
    } catch (error) {
      console.error('Error fetching workers:', error);
    } finally {
      setLoading(prev => ({ ...prev, workers: false }));
    }
  };





  const formatWeight = (weight: number): string => {
    return weight.toFixed(2);
  };

  // Format currency - kept for future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Prepare chart data
  const weeklyChartData = {
    labels: weeklyContributions.map(w => w.week),
    datasets: [
      {
        label: 'Peso Total (kg)',
        data: weeklyContributions.map(w => w.totalWeight),
        backgroundColor: 'rgba(199, 75, 111, 0.8)',
        borderColor: '#C74B6F',
        borderWidth: 2,
      },
    ],
  };

  const materialTrendData = {
    labels: weeklyContributions.map(w => w.week),
    datasets: Object.keys(weeklyContributions[0]?.materials || {}).map((materialId, index) => {
      const materialName = weeklyContributions[0]?.materials[materialId]?.materialName || materialId;
      const colors = ['#C74B6F', '#8A2736', '#5C1D2E', '#2D0D17', '#F7E4E4'];

      return {
        label: materialName,
        data: weeklyContributions.map(w => w.materials[materialId]?.weight || 0),
        borderColor: colors[index % colors.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.1,
      };
    }),
  };

  return (
    <Layout activePath="/worker-productivity">
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-[#c15079]">
          <h1 className="text-3xl font-bold text-[#7a1c44] mb-2">
            Produtividade dos Trabalhadores
          </h1>
          <p className="text-gray-600">
            Acompanhe o desempenho individual e contribuições semanais dos catadores
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-semibold text-[#7a1c44] mb-4 flex items-center">
            <FaFilter className="mr-2 text-[#c15079]" />
            Filtros
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="workerSelect" className="block text-sm font-semibold text-[#7a1c44] mb-2">
                Selecionar Trabalhador
              </label>
              <select
                id="workerSelect"
                className="w-full py-3 px-4 border border-gray-300 rounded-lg shadow-sm focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25 transition-colors duration-150"
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
              >
                <option value="">Selecione um trabalhador...</option>
                {workers.map((worker) => (
                  <option key={worker.wastepicker_id} value={worker.wastepicker_id}>
                    {worker.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="periodSelect" className="block text-sm font-semibold text-[#7a1c44] mb-2">
                Período (Semanas)
              </label>
              <select
                id="periodSelect"
                className="w-full py-3 px-4 border border-gray-300 rounded-lg shadow-sm focus:border-[#c15079] focus:ring-2 focus:ring-[#c15079] focus:ring-opacity-25 transition-colors duration-150"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(Number(e.target.value))}
              >
                <option value={4}>Últimas 4 semanas</option>
                <option value={8}>Últimas 8 semanas</option>
                <option value={12}>Últimas 12 semanas</option>
                <option value={24}>Últimas 24 semanas</option>
                <option value={52}>Último ano</option>
              </select>
            </div>
          </div>
        </div>

        {selectedWorker && (
          <>
            {/* Worker Info & Stats */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Worker Info */}
              <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-xl font-semibold text-[#7a1c44] mb-4 flex items-center">
                  <FaUser className="mr-2 text-[#c15079]" />
                  Informações do Trabalhador
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Nome:</span>
                    <span className="font-semibold text-[#7a1c44]">{selectedWorker.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">ID:</span>
                    <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                      {selectedWorker.wastepicker_id}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats Overview */}
              {productivityStats && (
                <div className="bg-white p-6 rounded-xl shadow-lg">
                  <h3 className="text-xl font-semibold text-[#7a1c44] mb-4 flex items-center">
                    <FaTrophy className="mr-2 text-[#c15079]" />
                    Estatísticas do Período
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-[#7a1c44]">
                        {formatWeight(productivityStats.totalWeight)}
                      </div>
                      <div className="text-sm text-gray-600">kg Total</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-[#7a1c44]">
                        {formatWeight(productivityStats.averageWeekly)}
                      </div>
                      <div className="text-sm text-gray-600">kg/Semana</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-[#7a1c44]">
                        {productivityStats.totalWeeks}
                      </div>
                      <div className="text-sm text-gray-600">Semanas Ativas</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-[#7a1c44]">
                        {formatWeight(productivityStats.bestWeek.weight)}
                      </div>
                      <div className="text-sm text-gray-600">Melhor Semana</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Charts */}
            {loading.contributions ? (
              <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-center items-center h-64">
                  <div className="text-[#c15079] animate-spin text-2xl">
                    <svg className="w-8 h-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                </div>
              </div>
            ) : weeklyContributions.length > 0 ? (
              <div className="grid lg:grid-cols-2 gap-6">
                {/* Weekly Contributions Chart */}
                <div className="bg-white p-6 rounded-xl shadow-lg">
                  <h3 className="text-xl font-semibold text-[#7a1c44] mb-4 flex items-center">
                    <FaCalendarWeek className="mr-2 text-[#c15079]" />
                    Contribuições Semanais
                  </h3>
                  <div className="h-72">
                    <Bar
                      data={weeklyChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                          y: {
                            beginAtZero: true,
                            ticks: {
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
                  </div>
                </div>

                {/* Material Trends Chart */}
                <div className="bg-white p-6 rounded-xl shadow-lg">
                  <h3 className="text-xl font-semibold text-[#7a1c44] mb-4 flex items-center">
                    <FaChartLine className="mr-2 text-[#c15079]" />
                    Tendência por Material
                  </h3>
                  <div className="h-72">
                    <Line
                      data={materialTrendData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                          y: {
                            beginAtZero: true,
                            ticks: {
                              callback: function (value) {
                                return value + ' kg';
                              }
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
                              label: function (context) {
                                return `${context.dataset.label}: ${formatWeight(context.raw as number)} kg`;
                              }
                            }
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="text-center py-12">
                  <FaWeightHanging className="mx-auto text-6xl text-gray-300 mb-4" />
                  <p className="text-gray-500 text-lg">
                    Nenhuma contribuição encontrada para este trabalhador no período selecionado.
                  </p>
                </div>
              </div>
            )}

            {/* Detailed Weekly Breakdown */}
            {weeklyContributions.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-xl font-semibold text-[#7a1c44] mb-4">
                  Detalhamento Semanal
                </h3>
                <div className="space-y-4">
                  {weeklyContributions.map((week, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold text-[#7a1c44]">
                          Semana {week.week}
                        </h4>
                        <div className="text-sm text-gray-600">
                          {week.weekStart} a {week.weekEnd}
                        </div>
                        <div className="font-bold text-[#c15079]">
                          {formatWeight(week.totalWeight)} kg
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(week.materials).map(([materialId, material]) => (
                          <div key={materialId} className="bg-gray-50 p-3 rounded">
                            <div className="font-medium text-sm text-[#7a1c44] mb-1">
                              {material.materialName}
                            </div>
                            <div className="text-lg font-bold text-[#c15079]">
                              {formatWeight(material.weight)} kg
                            </div>
                            <div className="text-xs text-gray-600">
                              {material.measurements.length} medições
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!selectedWorker && (
          <div className="bg-white p-6 rounded-xl shadow-lg">
            <div className="text-center py-12">
              <FaUser className="mx-auto text-6xl text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">
                Selecione um trabalhador para visualizar sua produtividade.
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 