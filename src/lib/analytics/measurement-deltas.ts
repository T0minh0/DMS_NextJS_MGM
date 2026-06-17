export type MeasurementDeltaRecord = {
  weight: number;
  timestamp: Date;
  materialId: bigint;
  bagFilled: boolean;
};

export type ProcessedDeltaMeasurement = {
  dateLabel: string;
  weight: number;
  bagFilled: string;
  timestamp: Date;
  netContribution: number;
  materialId: bigint;
};

export type WorkerMeasurementDeltaRecord = MeasurementDeltaRecord & {
  workerId: bigint;
};

export type DailyWorkerMaterialDelta = {
  workerId: bigint;
  materialId: bigint;
  date: string;
  weight: number;
};

export function processMeasurementDeltas(
  measurements: MeasurementDeltaRecord[],
): ProcessedDeltaMeasurement[] {
  return measurements.map((measurement) => ({
    dateLabel: measurement.timestamp.toLocaleDateString('pt-BR'),
    weight: measurement.weight,
    bagFilled: measurement.bagFilled ? 'S' : 'N',
    timestamp: measurement.timestamp,
    netContribution: Math.max(0, measurement.weight),
    materialId: measurement.materialId,
  }));
}

export function sumDailyWorkerMaterialDeltas(
  measurements: WorkerMeasurementDeltaRecord[],
): DailyWorkerMaterialDelta[] {
  const grouped = new Map<string, DailyWorkerMaterialDelta>();

  measurements.forEach((measurement) => {
    const date = measurement.timestamp.toISOString().split('T')[0];
    const key = `${measurement.workerId.toString()}|${measurement.materialId.toString()}|${date}`;
    const current = grouped.get(key);
    const weight = Math.max(0, measurement.weight);

    if (current) {
      current.weight = Number((current.weight + weight).toFixed(2));
      return;
    }

    grouped.set(key, {
      workerId: measurement.workerId,
      materialId: measurement.materialId,
      date,
      weight: Number(weight.toFixed(2)),
    });
  });

  return Array.from(grouped.values()).sort((left, right) => {
    const leftKey = `${left.workerId.toString()}|${left.materialId.toString()}|${left.date}`;
    const rightKey = `${right.workerId.toString()}|${right.materialId.toString()}|${right.date}`;
    return leftKey.localeCompare(rightKey);
  });
}
