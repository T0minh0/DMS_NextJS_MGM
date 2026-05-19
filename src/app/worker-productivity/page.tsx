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

ChartJS.defaults.color = '#94a3c7';
ChartJS.defaults.borderColor = '#2a3441';

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

const panelClass = 'surface-panel rounded-xl p-6';
const fieldClass = 'w-full rounded-lg border border-outline bg-surface-alt px-4 py-3 text-foreground shadow-sm focus:border-primary focus:ring-0';
const labelClass = 'block text-sm font-semibold text-on-surface mb-2';
const metricCardClass = 'rounded-lg border border-outline bg-surface-alt p-3 text-center';
const detailCardClass = 'rounded-lg border border-outline bg-surface-alt p-4';

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
        <div className={panelClass}>
          <h1 className="text-3xl font-bold text-primary mb-2">
            Produtividade dos Trabalhadores
          </h1>
          <p className="text-text-secondary">
            Acompanhe o desempenho individual e contribuições semanais dos catadores
          </p>
        </div>

        {/* Filters */}
        <div className={panelClass}>
          <h3 className="text-xl font-semibold text-on-surface mb-4 flex items-center">
            <FaFilter className="mr-2 text-primary" />
            Filtros
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="workerSelect" className={labelClass}>
                Selecionar Trabalhador
              </label>
              <select
                id="workerSelect"
                className={fieldClass}
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
              <label htmlFor="periodSelect" className={labelClass}>
                Período (Semanas)
              </label>
              <select
                id="periodSelect"
                className={fieldClass}
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
              <div className={panelClass}>
                <h3 className="text-xl font-semibold text-on-surface mb-4 flex items-center">
                  <FaUser className="mr-2 text-primary" />
                  Informações do Trabalhador
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Nome:</span>
                    <span className="font-semibold text-foreground">{selectedWorker.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">ID:</span>
                    <span className="font-mono text-sm rounded border border-outline bg-surface-alt px-2 py-1 text-primary">
                      {selectedWorker.wastepicker_id}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats Overview */}
              {productivityStats && (
                <div className={panelClass}>
                  <h3 className="text-xl font-semibold text-on-surface mb-4 flex items-center">
                    <FaTrophy className="mr-2 text-primary" />
                    Estatísticas do Período
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className={metricCardClass}>
                      <div className="text-2xl font-bold text-primary">
                        {formatWeight(productivityStats.totalWeight)}
                      </div>
                      <div className="text-sm text-text-secondary">kg Total</div>
                    </div>
                    <div className={metricCardClass}>
                      <div className="text-2xl font-bold text-primary">
                        {formatWeight(productivityStats.averageWeekly)}
                      </div>
                      <div className="text-sm text-text-secondary">kg/Semana</div>
                    </div>
                    <div className={metricCardClass}>
                      <div className="text-2xl font-bold text-primary">
                        {productivityStats.totalWeeks}
                      </div>
                      <div className="text-sm text-text-secondary">Semanas Ativas</div>
                    </div>
                    <div className={metricCardClass}>
                      <div className="text-2xl font-bold text-primary">
                        {formatWeight(productivityStats.bestWeek.weight)}
                      </div>
                      <div className="text-sm text-text-secondary">Melhor Semana</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Charts */}
            {loading.contributions ? (
              <div className={panelClass}>
                <div className="flex justify-center items-center h-64">
                  <div className="text-primary animate-spin text-2xl">
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
                <div className={panelClass}>
                  <h3 className="text-xl font-semibold text-on-surface mb-4 flex items-center">
                    <FaCalendarWeek className="mr-2 text-primary" />
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
                <div className={panelClass}>
                  <h3 className="text-xl font-semibold text-on-surface mb-4 flex items-center">
                    <FaChartLine className="mr-2 text-primary" />
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
              <div className={panelClass}>
                <div className="text-center py-12">
                  <FaWeightHanging className="mx-auto text-6xl text-text-secondary/50 mb-4" />
                  <p className="text-text-secondary text-lg">
                    Nenhuma contribuição encontrada para este trabalhador no período selecionado.
                  </p>
                </div>
              </div>
            )}

            {/* Detailed Weekly Breakdown */}
            {weeklyContributions.length > 0 && (
              <div className={panelClass}>
                <h3 className="text-xl font-semibold text-on-surface mb-4">
                  Detalhamento Semanal
                </h3>
                <div className="space-y-4">
                  {weeklyContributions.map((week, index) => (
                    <div key={index} className={detailCardClass}>
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-semibold text-foreground">
                          Semana {week.week}
                        </h4>
                        <div className="text-sm text-text-secondary">
                          {week.weekStart} a {week.weekEnd}
                        </div>
                        <div className="font-bold text-primary">
                          {formatWeight(week.totalWeight)} kg
                        </div>
                      </div>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(week.materials).map(([materialId, material]) => (
                          <div key={materialId} className="rounded border border-outline bg-surface p-3">
                            <div className="font-medium text-sm text-foreground mb-1">
                              {material.materialName}
                            </div>
                            <div className="text-lg font-bold text-primary">
                              {formatWeight(material.weight)} kg
                            </div>
                            <div className="text-xs text-text-secondary">
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
          <div className={panelClass}>
            <div className="text-center py-12">
              <FaUser className="mx-auto text-6xl text-text-secondary/50 mb-4" />
              <p className="text-text-secondary text-lg">
                Selecione um trabalhador para visualizar sua produtividade.
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
